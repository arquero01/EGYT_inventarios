import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cifrarContrasena, verificarContrasena } from '../src/auth/contrasenas.ts';
import { LimiteIntentos } from '../src/auth/limite.ts';
import { comando, crearEntorno, datosBodega, datosIngreso, datosProyecto, uuid, type Entorno } from './entorno.ts';

const json = (r: { body: string }) => JSON.parse(r.body);

describe('Contraseñas y límite de intentos', () => {
  it('cifra con scrypt y verifica sin guardar la contraseña', async () => {
    const huella = await cifrarContrasena('Panel solar 450');
    expect(huella).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(huella).not.toContain('Panel');
    expect(await verificarContrasena('Panel solar 450', huella)).toBe(true);
    expect(await verificarContrasena('panel solar 450', huella)).toBe(false);
    expect(await verificarContrasena('x', 'basura')).toBe(false);
    expect(await cifrarContrasena('Panel solar 450')).not.toBe(huella); // sal distinta cada vez
  });

  it('bloquea después del máximo y se libera al pasar la ventana', () => {
    let ahora = 0;
    const l = new LimiteIntentos(3, 1000, () => ahora);
    for (let i = 0; i < 3; i++) l.registrar('a');
    expect(l.bloqueado('a')).toBe(true);
    expect(l.bloqueado('b')).toBe(false);
    ahora = 1000;
    expect(l.bloqueado('a')).toBe(false);
  });
});

describe('Registro inmediato (configuración actual)', () => {
  let e: Entorno;
  beforeAll(async () => {
    e = await crearEntorno({ sesion: false });
  });
  afterAll(async () => e.cerrar());

  const registrar = (datos: Record<string, unknown>) => e.sinSesion({ method: 'POST', url: '/auth/registro', payload: datos });
  const ingresar = (correo: string, contrasena: string) =>
    e.sinSesion({ method: 'POST', url: '/auth/ingresar', payload: { correo, contrasena } });
  const con = (token: string) => ({ authorization: `Bearer ${token}` });

  let tokenAdmin = '';
  let tokenUsuario = '';
  let idUsuario = '';

  it('sin sesión no se puede consultar ni registrar operaciones', async () => {
    expect(json(await e.sinSesion({ method: 'GET', url: '/auth/opciones' }))).toEqual({ registroRequiereAprobacion: false });
    expect((await e.sinSesion({ method: 'GET', url: '/salud' })).statusCode).toBe(200);

    const r = await e.sinSesion({ method: 'GET', url: '/equipos' });
    expect(r.statusCode).toBe(401);
    expect(json(r).error.codigo).toBe('AUTH-05');

    const falso = await e.sinSesion({ method: 'GET', url: '/equipos', headers: con('token-inventado') });
    expect(falso.statusCode).toBe(401);
    expect(json(falso).error.codigo).toBe('AUTH-06');

    const escribir = await e.sinSesion({ method: 'POST', url: '/comandos', payload: comando('CREAR_PROYECTO', datosProyecto()) });
    expect(escribir.statusCode).toBe(401);
  });

  it('valida los datos del registro', async () => {
    const r = await registrar({ nombre: 'Al', correo: 'no-es-correo', contrasena: 'corta' });
    expect(r.statusCode).toBe(422);
    const cuerpo = json(r);
    expect(cuerpo.error.codigo).toBe('AUTH-11');
    const campos = cuerpo.error.detalles.map((d: { campo: string }) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['nombre', 'correo', 'contrasena']));

    const sinNumero = await registrar({ nombre: 'Ana Gómez', correo: 'ana@egt.co', contrasena: 'solo-letras' });
    expect(json(sinNumero).error.detalles[0].problema).toBe('Debe incluir al menos una letra y un número');
  });

  it('la primera cuenta queda como administrador y entra de una vez', async () => {
    const r = await registrar({ nombre: 'Laura Muñoz', correo: '  Laura@EGT.co ', contrasena: 'bodega2026' });
    expect(r.statusCode).toBe(201);
    const cuerpo = json(r);
    expect(cuerpo.pendiente).toBe(false);
    expect(cuerpo.usuario).toMatchObject({ nombre: 'Laura Muñoz', correo: 'laura@egt.co', rol: 'ADMIN', activo: true });
    expect(cuerpo.token).toMatch(/^[\w-]{43}$/);
    expect(JSON.stringify(cuerpo)).not.toContain('bodega2026');
    tokenAdmin = cuerpo.token;

    const yo = await e.sinSesion({ method: 'GET', url: '/auth/yo', headers: con(tokenAdmin) });
    expect(json(yo).usuario.rol).toBe('ADMIN');
  });

  it('las siguientes cuentas son de usuario y el correo no se repite', async () => {
    const r = await registrar({ nombre: 'Pedro Ruiz', correo: 'pedro@egt.co', contrasena: 'inversor99' });
    expect(r.statusCode).toBe(201);
    expect(json(r).usuario.rol).toBe('USUARIO');
    tokenUsuario = json(r).token;
    idUsuario = json(r).usuario.id;

    const repetido = await registrar({ nombre: 'Otro Pedro', correo: 'PEDRO@egt.co', contrasena: 'inversor99' });
    expect(repetido.statusCode).toBe(409);
    expect(json(repetido).error.codigo).toBe('AUTH-02');
  });

  it('ingresa con correo y contraseña; el error no revela cuál de los dos falló', async () => {
    const ok = await ingresar('Pedro@egt.co', 'inversor99');
    expect(ok.statusCode).toBe(200);
    expect(json(ok).usuario.correo).toBe('pedro@egt.co');

    const malaClave = await ingresar('pedro@egt.co', 'equivocada1');
    const sinCuenta = await ingresar('nadie@egt.co', 'equivocada1');
    expect(malaClave.statusCode).toBe(401);
    expect(json(malaClave).error).toEqual(json(sinCuenta).error);
    expect(json(malaClave).error.codigo).toBe('AUTH-01');
  });

  it('las operaciones quedan firmadas por la cuenta, no por lo que diga el celular', async () => {
    const bodega = datosBodega();
    const r = await e.sinSesion({
      method: 'POST',
      url: '/comandos',
      headers: con(tokenUsuario),
      payload: comando('CREAR_BODEGA', bodega, { autor: 'Alguien Más' }),
    });
    expect(r.statusCode, r.body).toBe(201);
    const filas = await e.conexion.db.execute(sql`SELECT autor, usuario_id FROM comandos WHERE id = ${json(r).id}`);
    const fila = ((filas as { rows?: unknown[] }).rows ?? filas) as { autor: string; usuario_id: string }[];
    expect(fila[0]).toEqual({ autor: 'Pedro Ruiz', usuario_id: idUsuario });
  });

  it('solo el administrador puede dar de baja equipos y ver las cuentas', async () => {
    const proyecto = datosProyecto();
    const bodega = datosBodega();
    const h = con(tokenUsuario);
    await e.sinSesion({ method: 'POST', url: '/comandos', headers: h, payload: comando('CREAR_PROYECTO', proyecto) });
    await e.sinSesion({ method: 'POST', url: '/comandos', headers: h, payload: comando('CREAR_BODEGA', bodega) });
    const ingreso = datosIngreso(proyecto.proyectoId, { bodegaId: bodega.bodegaId });
    const r = await e.sinSesion({ method: 'POST', url: '/comandos', headers: h, payload: comando('REGISTRAR_INGRESO', ingreso) });
    expect(r.statusCode, r.body).toBe(201);
    const equipoId = ingreso.equipoId;

    const baja = (token: string) =>
      e.sinSesion({
        method: 'POST',
        url: '/comandos',
        headers: con(token),
        payload: comando('DAR_DE_BAJA', { equipoId, motivo: 'Daño irreparable por descarga eléctrica', fecha: '2026-03-01' }),
      });
    const prohibida = await baja(tokenUsuario);
    expect(prohibida.statusCode).toBe(403);
    expect(json(prohibida).error.codigo).toBe('AUTH-07');

    // Sin conexión, la misma operación queda rechazada y pendiente de revisión.
    const sinConexion = comando('DAR_DE_BAJA', { equipoId, motivo: 'Daño irreparable por descarga eléctrica', fecha: '2026-03-01' });
    const push = await e.sinSesion({ method: 'POST', url: '/sync/push', headers: h, payload: { comandos: [sinConexion] } });
    expect(json(push).resultados[0]).toMatchObject({ resultado: 'RECHAZADO', error: { codigo: 'AUTH-07' } });
    const resolver = await e.sinSesion({ method: 'POST', url: `/sync/conflictos/${sinConexion.id}/resolver`, headers: h });
    expect(resolver.statusCode).toBe(403);

    const permitida = await baja(tokenAdmin);
    expect(permitida.statusCode, permitida.body).toBe(201);

    expect((await e.sinSesion({ method: 'GET', url: '/usuarios', headers: h })).statusCode).toBe(403);
    const lista = json(await e.sinSesion({ method: 'GET', url: '/usuarios', headers: con(tokenAdmin) }));
    expect(lista.map((u: { correo: string }) => u.correo).sort()).toEqual(['laura@egt.co', 'pedro@egt.co']);
    expect(JSON.stringify(lista)).not.toContain('scrypt');
  });

  it('nunca deja el sistema sin un administrador activo', async () => {
    const lista = json(await e.sinSesion({ method: 'GET', url: '/usuarios', headers: con(tokenAdmin) }));
    const laura = lista.find((u: { correo: string }) => u.correo === 'laura@egt.co');
    // Laura es la única administradora y además la cuenta principal.
    const r = await e.sinSesion({ method: 'PATCH', url: `/usuarios/${laura.id}`, headers: con(tokenAdmin), payload: { rol: 'USUARIO' } });
    expect(r.statusCode).toBe(409);
    expect(json(r).error.codigo).toBe('AUTH-13');

    const vacio = await e.sinSesion({ method: 'PATCH', url: `/usuarios/${laura.id}`, headers: con(tokenAdmin), payload: {} });
    expect(vacio.statusCode).toBe(422);
    const noExiste = await e.sinSesion({ method: 'PATCH', url: `/usuarios/${uuid()}`, headers: con(tokenAdmin), payload: { activo: false } });
    expect(noExiste.statusCode).toBe(404);
  });

  it('desactivar una cuenta la saca de inmediato; reactivarla le permite volver', async () => {
    const off = await e.sinSesion({ method: 'PATCH', url: `/usuarios/${idUsuario}`, headers: con(tokenAdmin), payload: { activo: false } });
    expect(off.statusCode).toBe(200);
    expect((await e.sinSesion({ method: 'GET', url: '/auth/yo', headers: con(tokenUsuario) })).statusCode).toBe(401);
    const bloqueado = await ingresar('pedro@egt.co', 'inversor99');
    expect(bloqueado.statusCode).toBe(403);
    expect(json(bloqueado).error.codigo).toBe('AUTH-04');

    await e.sinSesion({ method: 'PATCH', url: `/usuarios/${idUsuario}`, headers: con(tokenAdmin), payload: { activo: true } });
    const otraVez = await ingresar('pedro@egt.co', 'inversor99');
    expect(otraVez.statusCode).toBe(200);
    tokenUsuario = json(otraVez).token;
  });

  it('cambia la contraseña y cierra las demás sesiones', async () => {
    const otra = json(await ingresar('pedro@egt.co', 'inversor99')).token;
    const mal = await e.sinSesion({
      method: 'POST',
      url: '/auth/contrasena',
      headers: con(tokenUsuario),
      payload: { actual: 'no-es', nueva: 'medidor2027' },
    });
    expect(mal.statusCode).toBe(422);
    expect(json(mal).error.codigo).toBe('AUTH-09');

    const ok = await e.sinSesion({
      method: 'POST',
      url: '/auth/contrasena',
      headers: con(tokenUsuario),
      payload: { actual: 'inversor99', nueva: 'medidor2027' },
    });
    expect(ok.statusCode).toBe(200);
    expect((await e.sinSesion({ method: 'GET', url: '/auth/yo', headers: con(tokenUsuario) })).statusCode).toBe(200);
    expect((await e.sinSesion({ method: 'GET', url: '/auth/yo', headers: con(otra) })).statusCode).toBe(401);
    expect((await ingresar('pedro@egt.co', 'medidor2027')).statusCode).toBe(200);
  });

  it('el administrador puede restablecer una contraseña olvidada', async () => {
    const r = await e.sinSesion({ method: 'POST', url: `/usuarios/${idUsuario}/restablecer`, headers: con(tokenAdmin) });
    expect(r.statusCode).toBe(200);
    const { contrasenaTemporal } = json(r);
    expect(contrasenaTemporal).toMatch(/^(?=.*[a-zA-Z])(?=.*\d).{10}$/);
    expect((await e.sinSesion({ method: 'GET', url: '/auth/yo', headers: con(tokenUsuario) })).statusCode).toBe(401);
    expect((await ingresar('pedro@egt.co', contrasenaTemporal)).statusCode).toBe(200);
  });

  it('cerrar sesión invalida el token', async () => {
    const t = json(await ingresar('laura@egt.co', 'bodega2026')).token;
    expect((await e.sinSesion({ method: 'POST', url: '/auth/salir', headers: con(t) })).statusCode).toBe(200);
    expect((await e.sinSesion({ method: 'GET', url: '/auth/yo', headers: con(t) })).statusCode).toBe(401);
  });

  it('frena a quien intenta adivinar contraseñas', async () => {
    let ultimo = 0;
    for (let i = 0; i < 11; i++) ultimo = (await ingresar('laura@egt.co', `intento${i}`)).statusCode;
    expect(ultimo).toBe(429);
    // Ni siquiera con la contraseña correcta mientras dura el bloqueo.
    expect((await ingresar('laura@egt.co', 'bodega2026')).statusCode).toBe(429);
  });
});

describe('Registro con autorización (REGISTRO_REQUIERE_APROBACION=true)', () => {
  let e: Entorno;
  beforeAll(async () => {
    e = await crearEntorno({ registroRequiereAprobacion: true });
  });
  afterAll(async () => e.cerrar());

  it('la cuenta nueva espera hasta que el administrador la autorice', async () => {
    expect(json(await e.sinSesion({ method: 'GET', url: '/auth/opciones' }))).toEqual({ registroRequiereAprobacion: true });

    const r = await e.sinSesion({
      method: 'POST',
      url: '/auth/registro',
      payload: { nombre: 'Jorge Tique', correo: 'jorge@egt.co', contrasena: 'bateria123' },
    });
    expect(r.statusCode).toBe(202);
    const cuerpo = json(r);
    expect(cuerpo).toMatchObject({ pendiente: true, usuario: { activo: false }, aviso: { codigo: 'AUTH-03' } });
    expect(cuerpo.token).toBeUndefined();

    const antes = await e.sinSesion({ method: 'POST', url: '/auth/ingresar', payload: { correo: 'jorge@egt.co', contrasena: 'bateria123' } });
    expect(antes.statusCode).toBe(403);
    expect(json(antes).error.codigo).toBe('AUTH-03');

    const lista = json(await e.app.inject({ method: 'GET', url: '/usuarios' }));
    expect(lista.find((u: { correo: string }) => u.correo === 'jorge@egt.co').pendiente).toBe(true);

    await e.app.inject({ method: 'PATCH', url: `/usuarios/${cuerpo.usuario.id}`, payload: { activo: true } });
    const despues = await e.sinSesion({ method: 'POST', url: '/auth/ingresar', payload: { correo: 'jorge@egt.co', contrasena: 'bateria123' } });
    expect(despues.statusCode).toBe(200);
  });
});

describe('Cuenta principal y cuentas por autorizar', () => {
  let e: Entorno;
  beforeAll(async () => {
    e = await crearEntorno({ registroRequiereAprobacion: true });
  });
  afterAll(async () => e.cerrar());

  const registrar = (nombre: string, correo: string) =>
    e.sinSesion({ method: 'POST', url: '/auth/registro', payload: { nombre, correo, contrasena: 'clave-segura-1' } });
  const ingresar = async (correo: string) =>
    (await e.sinSesion({ method: 'POST', url: '/auth/ingresar', payload: { correo, contrasena: 'clave-segura-1' } })).json().token as string;

  it('la primera cuenta es la principal; las nuevas entran como usuario y por autorizar', async () => {
    const yo = json(await e.app.inject({ method: 'GET', url: '/auth/yo' })).usuario;
    expect(yo).toMatchObject({ rol: 'ADMIN', principal: true });
    const r = json(await registrar('Marta Ruiz', 'marta@egt.co'));
    expect(r.usuario).toMatchObject({ rol: 'USUARIO', activo: false, principal: false });
    const lista = json(await e.app.inject({ method: 'GET', url: '/usuarios' }));
    expect(lista[0].principal).toBe(true); // la principal va de primera
  });

  it('nadie puede quitarle el rol, desactivar ni cambiarle la contraseña a la principal', async () => {
    const yo = json(await e.app.inject({ method: 'GET', url: '/auth/yo' })).usuario;
    const marta = json(await e.app.inject({ method: 'GET', url: '/usuarios' })).find((u: { correo: string }) => u.correo === 'marta@egt.co');
    await e.app.inject({ method: 'PATCH', url: `/usuarios/${marta.id}`, payload: { activo: true, rol: 'ADMIN' } });
    const otra = { authorization: `Bearer ${await ingresar('marta@egt.co')}` };

    const quitarRol = await e.sinSesion({ method: 'PATCH', url: `/usuarios/${yo.id}`, headers: otra, payload: { rol: 'USUARIO' } });
    expect(quitarRol.statusCode).toBe(409);
    expect(json(quitarRol).error.codigo).toBe('AUTH-13');
    const desactivar = await e.sinSesion({ method: 'PATCH', url: `/usuarios/${yo.id}`, headers: otra, payload: { activo: false } });
    expect(json(desactivar).error.codigo).toBe('AUTH-13');
    const clave = await e.sinSesion({ method: 'POST', url: `/usuarios/${yo.id}/restablecer`, headers: otra });
    expect(clave.statusCode).toBe(403);
    expect(json(clave).error.codigo).toBe('AUTH-14');

    // La principal sí administra a las demás.
    expect((await e.app.inject({ method: 'PATCH', url: `/usuarios/${marta.id}`, payload: { rol: 'USUARIO' } })).statusCode).toBe(200);
    expect((await e.app.inject({ method: 'POST', url: `/usuarios/${marta.id}/restablecer` })).statusCode).toBe(200);
  });

  it('una cuenta por autorizar se puede rechazar; una que ya entró, no', async () => {
    const r = json(await registrar('Pedro Gil', 'pedro@egt.co'));
    const borrar = await e.app.inject({ method: 'DELETE', url: `/usuarios/${r.usuario.id}` });
    expect(borrar.statusCode).toBe(200);
    const lista = json(await e.app.inject({ method: 'GET', url: '/usuarios' }));
    expect(lista.some((u: { correo: string }) => u.correo === 'pedro@egt.co')).toBe(false);

    const marta = lista.find((u: { correo: string }) => u.correo === 'marta@egt.co');
    const noSe = await e.app.inject({ method: 'DELETE', url: `/usuarios/${marta.id}` });
    expect(noSe.statusCode).toBe(409);
    expect(json(noSe).error.codigo).toBe('AUTH-15');
  });
});
