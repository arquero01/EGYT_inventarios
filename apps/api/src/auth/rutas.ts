import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ErrorDominio, MENSAJES, cambioContrasena, cambioUsuario, errorValidacion, ingreso, registro, type CodigoMensaje, type Usuario } from '@egt/domain';
import type { BaseDatos } from '../db/cliente.ts';
import { LimiteIntentos } from './limite.ts';
import {
  cambiarContrasena,
  cambiarUsuario,
  cerrarSesion,
  errorNoAutenticado,
  errorProhibido,
  ingresar,
  limpiarSesionesVencidas,
  listarUsuarios,
  registrar,
  rechazarCuenta,
  restablecerContrasena,
  usuarioDeToken,
} from './servicio.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Cuenta que hizo la petición (null en las rutas públicas). */
    usuario: Usuario | null;
    token: string | null;
  }
}

export interface OpcionesAuth {
  /** true → las cuentas nuevas quedan inactivas hasta que un administrador las autorice. */
  registroRequiereAprobacion: boolean;
}

function leerCuerpo<T extends z.ZodType>(schema: T, datos: unknown, codigo: CodigoMensaje = 'AUTH-11'): z.output<T> {
  const r = schema.safeParse(datos ?? {});
  if (!r.success) {
    throw errorValidacion(
      codigo,
      r.error.issues.map((i) => ({ campo: i.path.map(String).join('.') || '(raíz)', problema: i.message })),
    );
  }
  return r.data;
}

const tokenDe = (req: FastifyRequest): string | null => {
  const cabecera = req.headers.authorization;
  if (!cabecera) return null;
  const [esquema, valor] = cabecera.split(' ');
  return esquema?.toLowerCase() === 'bearer' && valor ? valor.trim() : null;
};

const dispositivoDe = (req: FastifyRequest) => {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
};

/** Hook onRequest: exige una sesión vigente y deja la cuenta en req.usuario. */
export function exigirSesion(db: BaseDatos) {
  return async (req: FastifyRequest) => {
    const token = tokenDe(req);
    if (!token) throw errorNoAutenticado('AUTH-05');
    const usuario = await usuarioDeToken(db, token);
    if (!usuario) throw errorNoAutenticado('AUTH-06');
    req.usuario = usuario;
    req.token = token;
  };
}

/** preHandler para rutas de administrador. */
export async function soloAdmin(req: FastifyRequest) {
  if (req.usuario?.rol !== 'ADMIN') throw errorProhibido();
}

const idUsuario = z.object({ id: z.uuid({ error: 'Debe ser un UUID válido' }) });

/** Rutas públicas de cuentas: registro, ingreso y opciones. */
export function rutasPublicasAuth(app: FastifyInstance, db: BaseDatos, opciones: OpcionesAuth) {
  // 10 intentos fallidos por correo y 30 por IP cada 15 minutos; 10 registros por IP por hora.
  const fallosCorreo = new LimiteIntentos(10, 15 * 60_000);
  const fallosIp = new LimiteIntentos(30, 15 * 60_000);
  const registrosIp = new LimiteIntentos(10, 60 * 60_000);
  const limite = () => new ErrorDominio('AUTH-08', 'LIMITE');

  /** Lo que el panel y la app necesitan saber antes de mostrar el formulario. */
  app.get('/auth/opciones', async () => ({ registroRequiereAprobacion: opciones.registroRequiereAprobacion }));

  app.post('/auth/registro', async (req, reply) => {
    if (registrosIp.bloqueado(req.ip)) throw limite();
    const datos = leerCuerpo(registro, req.body);
    registrosIp.registrar(req.ip);
    const r = await registrar(db, datos, { requiereAprobacion: opciones.registroRequiereAprobacion, dispositivo: dispositivoDe(req) });
    if (r.pendiente) {
      return reply.status(202).send({ pendiente: true, usuario: r.usuario, aviso: { codigo: 'AUTH-03', mensaje: MENSAJES['AUTH-03'] } });
    }
    return reply.status(201).send(r);
  });

  app.post('/auth/ingresar', async (req) => {
    const datos = leerCuerpo(ingreso, req.body);
    const llaveCorreo = datos.correo;
    if (fallosCorreo.bloqueado(llaveCorreo) || fallosIp.bloqueado(req.ip)) throw limite();
    try {
      const sesion = await ingresar(db, datos, dispositivoDe(req));
      fallosCorreo.reiniciar(llaveCorreo);
      if (Math.random() < 0.05) void limpiarSesionesVencidas(db).catch(() => {});
      return sesion;
    } catch (e) {
      if (e instanceof ErrorDominio && e.codigo === 'AUTH-01') {
        fallosCorreo.registrar(llaveCorreo);
        fallosIp.registrar(req.ip);
      }
      throw e;
    }
  });
}

/** Rutas de cuentas que requieren sesión (se registran dentro del contexto protegido). */
export function rutasPrivadasAuth(app: FastifyInstance, db: BaseDatos) {
  app.get('/auth/yo', async (req) => ({ usuario: req.usuario }));

  app.post('/auth/salir', async (req) => {
    if (req.token) await cerrarSesion(db, req.token);
    return { ok: true };
  });

  app.post('/auth/contrasena', async (req) => {
    const { actual, nueva } = leerCuerpo(cambioContrasena, req.body);
    return cambiarContrasena(db, req.usuario!.id, req.token!, actual, nueva);
  });

  app.get('/usuarios', { preHandler: soloAdmin }, async () => listarUsuarios(db));

  app.patch('/usuarios/:id', { preHandler: soloAdmin }, async (req) => {
    const { id } = leerCuerpo(idUsuario, req.params, 'AUTH-12');
    return cambiarUsuario(db, id, leerCuerpo(cambioUsuario, req.body));
  });

  app.post('/usuarios/:id/restablecer', { preHandler: soloAdmin }, async (req) => {
    const { id } = leerCuerpo(idUsuario, req.params, 'AUTH-12');
    return restablecerContrasena(db, id, req.usuario!.id);
  });

  app.delete('/usuarios/:id', { preHandler: soloAdmin }, async (req) => {
    const { id } = leerCuerpo(idUsuario, req.params, 'AUTH-12');
    return rechazarCuenta(db, id);
  });
}
