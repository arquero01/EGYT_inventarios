import { mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { construirApp } from '../../api/src/app.ts';
import { conectar } from '../../api/src/db/cliente.ts';
import { migrar } from '../../api/src/db/migrar.ts';

/**
 * Enciende el mismo servidor de apps/api dentro del computador: la base de
 * datos (PGlite) queda en una carpeta del usuario y el panel se sirve desde
 * los archivos ya compilados. No depende de Electron, así que se puede
 * probar con Node solo.
 */

export interface OpcionesServidorLocal {
  /** Carpeta donde vive la base de datos (se crea si no existe). */
  carpetaDatos: string;
  /** Carpeta del panel web compilado (apps/web/dist). */
  carpetaPanel: string;
  /** Puerto preferido; si está ocupado se prueban los siguientes. */
  puerto?: number;
  /** Arranca desde una copia de seguridad (la carpeta de datos debe estar vacía). */
  restaurarDesde?: Blob;
  registroRequiereAprobacion?: boolean;
}

export interface ServidorLocal {
  puerto: number;
  /** Dirección para la ventana del propio computador. */
  urlLocal: string;
  /** Direcciones para los celulares en la misma red (una por tarjeta de red). */
  direccionesRed: () => string[];
  /** Copia completa de la base en .tar.gz. */
  respaldar: () => Promise<Blob>;
  cerrar: () => Promise<void>;
}

const INTENTOS_PUERTO = 10;

/** IPv4 de las tarjetas de red activas (WiFi, cable), sin la interna. */
export function direccionesIPv4(): string[] {
  const ips: string[] = [];
  for (const lista of Object.values(networkInterfaces())) {
    for (const red of lista ?? []) {
      if (red.family === 'IPv4' && !red.internal && !red.address.startsWith('169.254.')) ips.push(red.address);
    }
  }
  // Las redes de casa y oficina (192.168.x.x, 10.x.x.x) primero.
  return ips.sort((a, b) => Number(!/^(192\.168|10)\./.test(a)) - Number(!/^(192\.168|10)\./.test(b)));
}

async function escuchar(app: ReturnType<typeof construirApp>, preferido: number): Promise<number> {
  for (let puerto = preferido; puerto < preferido + INTENTOS_PUERTO; puerto++) {
    try {
      // 0.0.0.0: también lo alcanzan los celulares de la misma red.
      await app.listen({ port: puerto, host: '0.0.0.0' });
      return puerto;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    }
  }
  throw new Error(`Los puertos ${preferido} a ${preferido + INTENTOS_PUERTO - 1} están ocupados por otros programas.`);
}

export async function iniciarServidorLocal(opciones: OpcionesServidorLocal): Promise<ServidorLocal> {
  mkdirSync(opciones.carpetaDatos, { recursive: true });
  const conexion = await conectar(
    `pglite:${opciones.carpetaDatos}`,
    opciones.restaurarDesde ? { restaurarDesde: opciones.restaurarDesde } : {},
  );
  try {
    await migrar(conexion);
    const app = construirApp(conexion.db, {
      logger: false,
      carpetaPanel: opciones.carpetaPanel,
      registroRequiereAprobacion: opciones.registroRequiereAprobacion ?? false,
    });
    const puerto = await escuchar(app, opciones.puerto ?? 3000);
    let cerrado = false;
    return {
      puerto,
      urlLocal: `http://127.0.0.1:${puerto}`,
      direccionesRed: () => direccionesIPv4().map((ip) => `http://${ip}:${puerto}`),
      respaldar: () => {
        if (!conexion.respaldar) throw new Error('Esta base de datos no admite copias de seguridad.');
        return conexion.respaldar();
      },
      cerrar: async () => {
        if (cerrado) return;
        cerrado = true;
        await app.close();
        await conexion.cerrar();
      },
    };
  } catch (e) {
    await conexion.cerrar().catch(() => {});
    throw e;
  }
}
