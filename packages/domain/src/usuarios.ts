import { z } from 'zod';
import type { TipoComando } from './comandos.ts';

/**
 * Cuentas de usuario: cada persona entra con su correo y contraseña.
 * Estas validaciones las comparten el servidor, la app y el panel web.
 */

export const ROLES = ['ADMIN', 'USUARIO'] as const;
export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  USUARIO: 'Usuario',
};

/** Operaciones que solo puede hacer un administrador. */
export const COMANDOS_SOLO_ADMIN: readonly TipoComando[] = ['DAR_DE_BAJA', 'IMPORTAR_HISTORICO'];

export const puedeEjecutar = (rol: Rol, tipo: TipoComando) => rol === 'ADMIN' || !COMANDOS_SOLO_ADMIN.includes(tipo);

export const LARGO_MINIMO_CONTRASENA = 8;

const correo = z
  .string({ error: 'Es obligatorio' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Correo electrónico inválido' }).max(150, 'Máximo 150 caracteres'));

const contrasena = z
  .string({ error: 'Es obligatorio' })
  .min(LARGO_MINIMO_CONTRASENA, `Debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`)
  .max(200, 'Máximo 200 caracteres')
  .refine((c) => /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(c) && /\d/.test(c), 'Debe incluir al menos una letra y un número');

export const registro = z.object({
  nombre: z.string({ error: 'Es obligatorio' }).trim().min(3, 'Escriba su nombre completo').max(150, 'Máximo 150 caracteres'),
  correo,
  contrasena,
});

/** Al ingresar no se revisa la forma de la contraseña: solo si coincide. */
export const ingreso = z.object({
  correo,
  contrasena: z.string({ error: 'Es obligatorio' }).min(1, 'Es obligatorio').max(200),
});

export const cambioContrasena = z.object({
  actual: z.string({ error: 'Es obligatorio' }).min(1, 'Es obligatorio').max(200),
  nueva: contrasena,
});

/** Lo que un administrador puede cambiar de una cuenta. */
export const cambioUsuario = z
  .object({
    rol: z.enum(ROLES, { error: 'Rol no válido' }).optional(),
    activo: z.boolean({ error: 'Debe ser verdadero o falso' }).optional(),
  })
  .refine((d) => d.rol !== undefined || d.activo !== undefined, 'Indique el rol o si la cuenta está activa');

export type DatosRegistro = z.output<typeof registro>;
export type DatosIngreso = z.output<typeof ingreso>;

/** Usuario tal como lo ven la app y el panel (nunca incluye la contraseña). */
export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
}
