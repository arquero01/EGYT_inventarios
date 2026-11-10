import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ESTADOS_EQUIPO,
  ErrorDominio,
  MENSAJES,
  TIPOS_EQUIPO,
  TIPOS_MOVIMIENTO,
  UBICACIONES,
  errorValidacion,
  validarComando,
  type CodigoMensaje,
} from '@egt/domain';
import type { BaseDatos } from './db/cliente.ts';
import { ejecutarComando, traducirError } from './comandos/ejecutor.ts';
import { ESTADOS_GARANTIA, hojaDeVida, listarEquipos, listarZonas } from './consultas/equipos.ts';
import { resumenInventario, stockPorTipo } from './consultas/inventario.ts';
import {
  detalleBodega,
  detalleMovimiento,
  existenciasEn,
  kardexArticulo,
  listarArticulos,
  listarBodegas,
  listarMovimientos,
} from './consultas/logistica.ts';
import { fichaProyecto, listarProyectos } from './consultas/proyectos.ts';
import { cambiosDesde, conflictosPendientes, marcarConflictoResuelto } from './consultas/sincronizacion.ts';
import { exigirSesion, rutasPrivadasAuth, rutasPublicasAuth, soloAdmin } from './auth/rutas.ts';

export const ESTADO_HTTP = {
  VALIDACION: 422,
  CONFLICTO: 409,
  NO_ENCONTRADO: 404,
  NO_AUTENTICADO: 401,
  PROHIBIDO: 403,
  LIMITE: 429,
  INTERNO: 500,
} as const;

/** Lo que se ve en "/" si el panel todavía no se ha compilado. */
const PANEL_SIN_COMPILAR = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>eg&amp;t Inventario</title>
<body style="font-family:system-ui,sans-serif;background:#f2f7fc;color:#0f2236;padding:40px 20px">
<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #d3dee9;border-radius:8px;padding:28px">
<h1 style="margin-top:0;font-size:24px">El servidor está funcionando</h1>
<p>Falta compilar el panel web. En la terminal ejecute:</p>
<pre style="background:#0a2540;color:#fff;padding:14px;border-radius:6px">pnpm build:web</pre>
<p>Cuando termine, recargue esta página. No hace falta reiniciar el servidor.</p>
<p style="color:#526477;font-size:14px">La app del celular ya puede conectarse a esta dirección.</p>
</div></body></html>`;

export interface OpcionesApp {
  logger?: boolean | object;
  /** true → las cuentas nuevas esperan autorización de un administrador. */
  registroRequiereAprobacion?: boolean;
  /** Carpeta con el panel web ya compilado (apps/web/dist). Se sirve en "/". */
  carpetaPanel?: string | null;
}

/** Valida query/params con Zod y lanza el error de negocio indicado. */
function leer<T extends z.ZodType>(schema: T, datos: unknown, codigo: CodigoMensaje = 'RF-23'): z.output<T> {
  const r = schema.safeParse(datos);
  if (!r.success) {
    throw errorValidacion(
      codigo,
      r.error.issues.map((i) => ({ campo: i.path.map(String).join('.') || '(raíz)', problema: i.message })),
    );
  }
  return r.data;
}

const idUuid = z.object({ id: z.uuid({ error: 'Debe ser un UUID válido' }) });

const filtrosEquipos = z.object({
  estado: z.enum(ESTADOS_EQUIPO, { error: MENSAJES['RF-09'] }).optional(),
  tipo: z.enum(TIPOS_EQUIPO, { error: 'Tipo de equipo no válido' }).optional(),
  proyectoId: z.uuid({ error: 'Debe ser un UUID válido' }).optional(),
  ubicacion: z.enum(UBICACIONES, { error: 'Debe ser BODEGA o CAMPO' }).optional(),
  bodegaId: z.uuid({ error: 'Debe ser un UUID válido' }).optional(),
  zona: z.string().trim().max(120).optional(),
  garantia: z.enum(ESTADOS_GARANTIA, { error: `Debe ser ${ESTADOS_GARANTIA.join(', ')}` }).optional(),
  pendientes: z.enum(['si', 'no']).optional().transform((v) => v === 'si'),
  sinProyecto: z.enum(['si', 'no']).optional().transform((v) => v === 'si'),
  verificar: z.enum(['si', 'no']).optional().transform((v) => v === 'si'),
  q: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

const filtrosMovimientos = z.object({
  tipo: z.enum(TIPOS_MOVIMIENTO, { error: 'Tipo de movimiento no válido' }).optional(),
  bodegaId: z.uuid({ error: 'Debe ser un UUID válido' }).optional(),
  proyectoId: z.uuid({ error: 'Debe ser un UUID válido' }).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

const lugarExistencias = z.object({
  bodegaId: z.uuid({ error: 'Debe ser un UUID válido' }).optional(),
  proyectoId: z.uuid({ error: 'Debe ser un UUID válido' }).optional(),
});

const paginaCambios = z.object({
  desde: z.coerce.number().int().min(0).default(0),
  limite: z.coerce.number().int().min(1).max(1000).default(500),
});

const lotePush = z.object({
  comandos: z.array(z.unknown()).min(1, 'Envíe al menos un comando').max(200, 'Máximo 200 comandos por envío'),
});

export function construirApp(db: BaseDatos, opciones: OpcionesApp = {}): FastifyInstance {
  const app = Fastify({ logger: opciones.logger ?? false, trustProxy: true });
  app.decorateRequest('usuario', null);
  app.decorateRequest('token', null);

  // ── Errores: siempre { error: { codigo, tipo, mensaje, detalles } } ──────
  app.setErrorHandler((e, req, reply) => {
    const dominio = traducirError(e);
    if (dominio) {
      if (dominio.tipo === 'INTERNO') req.log.error({ err: e }, dominio.message);
      return reply.status(ESTADO_HTTP[dominio.tipo]).send({ error: dominio.toJSON() });
    }
    const conStatus = e as { statusCode?: number; message?: string };
    if (conStatus.statusCode && conStatus.statusCode < 500) {
      // Errores de Fastify (JSON mal formado, cuerpo vacío…).
      return reply.status(conStatus.statusCode).send({
        error: { codigo: 'RF-23', tipo: 'VALIDACION', mensaje: MENSAJES['RF-23'], detalles: [{ campo: '(cuerpo)', problema: conStatus.message ?? '' }] },
      });
    }
    req.log.error({ err: e }, 'Error no controlado');
    return reply.status(500).send({ error: new ErrorDominio('INTERNO', 'INTERNO').toJSON() });
  });

  app.get('/salud', async () => ({ estado: 'ok' }));

  // ── Panel web de la oficina (archivos estáticos, sin sesión) ────────────
  // Usa rutas con # (HashRouter): basta con servir los archivos tal cual.
  // La carpeta se revisa en cada visita: si el panel se compila con el
  // servidor ya encendido, aparece sin reiniciar.
  if (opciones.carpetaPanel) {
    const carpeta = opciones.carpetaPanel;
    app.register(fastifyStatic, { root: carpeta, prefix: '/', index: false });
    app.get('/', async (_req, reply) => {
      if (existsSync(join(carpeta, 'index.html'))) return reply.sendFile('index.html');
      return reply.type('text/html; charset=utf-8').send(PANEL_SIN_COMPILAR);
    });
  }

  // ── Cuentas: registro e ingreso no piden sesión ─────────────────────────
  rutasPublicasAuth(app, db, { registroRequiereAprobacion: opciones.registroRequiereAprobacion ?? false });

  // Todo lo que sigue exige haber iniciado sesión (encabezado Authorization: Bearer <token>).
  app.register(async (app) => {
    app.addHook('onRequest', exigirSesion(db));
    rutasPrivadasAuth(app, db);

    // ── Escrituras ──────────────────────────────────────────────────────────

    /** Una operación en línea. Mismo formato que las que se envían por /sync/push. */
    app.post('/comandos', async (req, reply) => {
      const r = await ejecutarComando(db, req.body, 'EN_LINEA', req.usuario);
      if (r.resultado === 'RECHAZADO' && r.error) {
        return reply.status(ESTADO_HTTP[r.error.tipo]).send({ id: r.id, duplicado: r.duplicado, error: r.error });
      }
      return reply.status(r.duplicado ? 200 : 201).send(r);
    });

    /** RF-23: valida sin guardar. Devuelve { valido: boolean, error? }. */
    app.post('/comandos/validar', async (req) => {
      const r = validarComando(req.body);
      return r.valido ? { valido: true } : { valido: false, error: r.error.toJSON() };
    });

    // ── Sincronización (RNF-01) ─────────────────────────────────────────────

    /** Envía las operaciones hechas sin conexión, en el orden en que ocurrieron. */
    app.post('/sync/push', async (req) => {
      const { comandos } = leer(lotePush, req.body);
      const resultados = [];
      for (const c of comandos) {
        resultados.push(await ejecutarComando(db, c, 'SINCRONIZACION', req.usuario));
      }
      const rechazados = resultados.filter((r) => r.resultado === 'RECHAZADO').length;
      return {
        resultados,
        ...(rechazados > 0 ? { aviso: { codigo: 'RNF-01', mensaje: MENSAJES['RNF-01'], rechazados } } : {}),
      };
    });

    app.get('/sync/cambios', async (req) => {
      const { desde, limite } = leer(paginaCambios, req.query);
      return cambiosDesde(db, desde, limite);
    });

    app.get('/sync/conflictos', async () => conflictosPendientes(db));

    app.post('/sync/conflictos/:id/resolver', { preHandler: soloAdmin }, async (req) => {
      const { id } = leer(idUuid, req.params);
      return marcarConflictoResuelto(db, id);
    });

    // ── Consultas ───────────────────────────────────────────────────────────

    app.get('/inventario/resumen', async () => resumenInventario(db));
    app.get('/inventario/stock-por-tipo', async () => stockPorTipo(db));

    app.get('/equipos', async (req) => {
      const query = req.query as Record<string, unknown>;
      // Mensajes específicos según el filtro inválido (RF-09/RF-20, RF-21).
      const codigo: CodigoMensaje = 'estado' in query && !ESTADOS_EQUIPO.includes(query.estado as never) ? 'RF-09' : 'RF-23';
      return listarEquipos(db, leer(filtrosEquipos, query, codigo));
    });

    app.get('/zonas', async () => listarZonas(db));

    /** RF-16: acepta el id (UUID) o el serial. */
    app.get('/equipos/:idOSerial', async (req) => {
      const { idOSerial } = req.params as { idOSerial: string };
      return hojaDeVida(db, decodeURIComponent(idOSerial));
    });

    app.get('/proyectos', async () => listarProyectos(db));

    app.get('/proyectos/:id', async (req) => {
      const { id } = leer(idUuid, req.params, 'RF-02');
      return fichaProyecto(db, id);
    });

    // ── Logística (RL-01 a RL-11) ───────────────────────────────────────────

    app.get('/bodegas', async () => listarBodegas(db));

    app.get('/bodegas/:id', async (req) => {
      const { id } = leer(idUuid, req.params, 'RL-01-NO-EXISTE');
      return detalleBodega(db, id);
    });

    app.get('/articulos', async () => listarArticulos(db));

    /** Artículos con cantidad disponible en una bodega o en un proyecto. */
    app.get('/existencias', async (req) => existenciasEn(db, leer(lugarExistencias, req.query)));

    app.get('/articulos/:id', async (req) => {
      const { id } = leer(idUuid, req.params, 'RL-03-NO-EXISTE');
      return kardexArticulo(db, id);
    });

    app.get('/movimientos', async (req) => listarMovimientos(db, leer(filtrosMovimientos, req.query)));

    /** Guía de un movimiento: acepta el id o el número (DES-000001). */
    app.get('/movimientos/:idONumero', async (req) => {
      const { idONumero } = req.params as { idONumero: string };
      return detalleMovimiento(db, decodeURIComponent(idONumero));
    });
  });

  return app;
}
