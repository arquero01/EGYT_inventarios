import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Huellas de contraseña con scrypt (incluido en Node, sin dependencias).
 * Formato guardado: scrypt$N$r$p$sal$huella  (sal y huella en base64url).
 * Guardar los parámetros permite subirlos en el futuro sin romper las cuentas viejas.
 */
const PARAMETROS = { N: 16384, r: 8, p: 1 } as const;
const LARGO = 64;

function derivar(contrasena: string, sal: Buffer, opciones: ScryptOptions): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    scrypt(contrasena.normalize('NFC'), sal, LARGO, { ...opciones, maxmem: 64 * 1024 * 1024 }, (e, clave) =>
      e ? rechazar(e) : resolver(clave),
    );
  });
}

export async function cifrarContrasena(contrasena: string): Promise<string> {
  const sal = randomBytes(16);
  const huella = await derivar(contrasena, sal, PARAMETROS);
  const { N, r, p } = PARAMETROS;
  return `scrypt$${N}$${r}$${p}$${sal.toString('base64url')}$${huella.toString('base64url')}`;
}

export async function verificarContrasena(contrasena: string, guardada: string): Promise<boolean> {
  const partes = guardada.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, sal, huella] = partes as [string, string, string, string, string, string];
  const esperada = Buffer.from(huella, 'base64url');
  const calculada = await derivar(contrasena, Buffer.from(sal, 'base64url'), { N: Number(N), r: Number(r), p: Number(p) });
  return esperada.length === calculada.length && timingSafeEqual(esperada, calculada);
}

/**
 * Huella de relleno: cuando el correo no existe se verifica contra esta, para
 * que la respuesta tarde lo mismo y no revele qué correos tienen cuenta.
 */
let huellaRelleno: Promise<string> | null = null;
export const obtenerHuellaRelleno = () => (huellaRelleno ??= cifrarContrasena(randomBytes(12).toString('hex')));

/** Token de sesión: 32 bytes aleatorios. En la base solo se guarda su SHA-256. */
export const nuevoToken = () => randomBytes(32).toString('base64url');
export const huellaToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Contraseña temporal legible (sin 0/O ni 1/l) para restablecer una cuenta. */
export function contrasenaTemporal(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  const todos = letras + letras.toUpperCase() + numeros;
  const bytes = randomBytes(10);
  let s = '';
  for (let i = 0; i < 8; i++) s += todos[bytes[i]! % todos.length];
  // Garantiza al menos una letra y un número (regla de la contraseña).
  return s + letras[bytes[8]! % letras.length] + numeros[bytes[9]! % numeros.length];
}
