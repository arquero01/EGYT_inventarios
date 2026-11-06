# EGYT_inventarios

Inventarios para la empresa prestadora de servicios eg&t: control de equipos de energía sostenible (paneles, baterías, inversores y medidores) y de la logística de bodegas, despachos, traslados y devoluciones.

El proyecto tiene tres partes:

| Carpeta | Qué es |
|---|---|
| `packages/domain` | Reglas del negocio (estados, validaciones, mensajes). Las usan el servidor y la app. |
| `apps/api` | Servidor (API) con PostgreSQL. |
| `apps/mobile` | App Android (React Native con Expo SDK 57). |

## Obtener la APK

GitHub compila la APK sola cada vez que cambia la app o el dominio (flujo `.github/workflows/apk-android.yml`, unos 20 minutos).

- **Desde el celular:** abra el repositorio en GitHub → **Releases** → **APK más reciente** → descargue `egt-inventario.apk`. Android pedirá permitir la instalación desde el navegador.
- **Desde el PC:** **Actions** → **APK Android** → la última ejecución → **Artifacts** → `egt-inventario-apk`.
- Para compilarla sin cambiar código: **Actions** → **APK Android** → **Run workflow**.

## Poner el servidor en línea (Codespaces)

La app necesita la dirección pública del servidor. Para pruebas y demostraciones, Codespaces sirve:

1. En la terminal del Codespace:
   ```bash
   pnpm install
   pnpm dev
   ```
   El servidor queda en el puerto 3000, con PostgreSQL embebido. Los datos se guardan en `apps/api/.pglite`.
2. En la pestaña **Puertos**, clic derecho sobre el **3000** → **Visibilidad del puerto** → **Público**.
3. Copie la **dirección reenviada** (algo como `https://nombre-del-codespace-3000.app.github.dev`).
4. En la app: **Ajustes** → pegue la dirección → **Guardar y probar conexión**.

Codespaces se apaga tras 30 minutos sin actividad. Mientras tanto, la app sigue funcionando: muestra los últimos datos guardados y deja las operaciones en cola hasta que el servidor vuelva. Para uso diario, el servidor debe ir en un hosting permanente con PostgreSQL (ver *Producción*).

## Desarrollo

Requiere Node.js 22 o superior y pnpm 12 (`npm install -g pnpm`).

```bash
pnpm install
pnpm dev          # API en http://localhost:3000 con PostgreSQL embebido
pnpm test         # pruebas del dominio, la API y la app
pnpm typecheck    # revisión de tipos de todo el proyecto
```

La app se prueba en un celular con Android Studio o con `pnpm --filter @egt/mobile android` (necesita el SDK de Android instalado).

### Producción

Con un PostgreSQL real: copie `apps/api/.env.example` a `apps/api/.env`, ponga `DATABASE_URL=postgres://…` y ejecute:

```bash
pnpm build
pnpm --filter @egt/api migrate:prod
pnpm --filter @egt/api start
```

Para desarrollo local con PostgreSQL: `docker compose up -d`. Para correr las pruebas contra un PostgreSQL real (borra el esquema `public` de esa base): `TEST_DATABASE_URL=postgres://usuario@localhost:5432/egt_pruebas pnpm test`.

## La app

| Pestaña | Funciones |
|---|---|
| Inicio | Resumen del inventario (RF-18), stock por tipo (RF-10), operaciones pendientes y accesos rápidos |
| Inventario | Búsqueda (RF-22), filtros por estado, tipo y ubicación (RF-19 a RF-21) y hoja de vida (RF-16, RF-17) con sus acciones: instalar, retirar, mantenimiento, baja y cambio de proyecto (RF-03, RF-11 a RF-15) |
| Proyectos | Lista con resumen (RF-05), ficha y equipos del proyecto (RF-02, RF-04), creación (RF-01) |
| Logística | Ingreso de equipos y de artículos, despachos, traslados, devoluciones, bodegas, kardex de artículos y guías |
| Ajustes | Dirección del servidor, nombre de quien usa la app, cola sin conexión y operaciones rechazadas |

**Sin conexión (RNF-01).** Cada formulario se valida en el celular con las mismas reglas del servidor (RF-23). Si no hay señal, la operación queda guardada en el celular y se envía sola cada 30 segundos o al volver a abrir la app. Las pantallas muestran la última copia de los datos con un aviso. Si al llegar una operación ya no es válida (por ejemplo, otro técnico instaló el mismo equipo), queda en **Ajustes → Operaciones rechazadas**.

## Ideas centrales del servidor

**Toda escritura es un comando.** La app no edita filas: envía operaciones (`INSTALAR_EQUIPO`, `REGISTRAR_DESPACHO`…) con un id generado en el celular, en línea (`POST /comandos`) o después (`POST /sync/push`). Si llega dos veces, se aplica una sola.

**El historial es inmutable (RF-17).** Cada cambio escribe su evento en la misma transacción. La base de datos rechaza cualquier `UPDATE`, `DELETE` o `TRUNCATE` sobre el historial y sobre las guías de movimiento, y cualquier cambio a un equipo dado de baja (RF-15).

**Estado y ubicación son independientes.** El estado (RF-09) dice qué le pasa al equipo; la ubicación dice dónde está: en una **bodega** o en **campo** (en su proyecto). Un equipo "En stock" puede estar en la bodega o ya despachado a la vereda.

**Control mixto.** Los equipos principales se controlan por serial. Los artículos menores (cables, conectores, estructuras) se controlan por cantidad, con existencias por bodega y por proyecto que nunca pueden quedar negativas.

## Máquina de estados

| Acción | Desde | Hacia | Requerimiento |
|---|---|---|---|
| Ingreso | — | En stock (en bodega) | RF-06 |
| Instalar | En stock | Instalado (en campo) | RF-11, RF-12 |
| Retirar (motivo ≥ 10 caracteres) | Instalado | En stock (sigue en campo) | RF-13 |
| Enviar a mantenimiento (motivo) | En stock, Instalado | En mantenimiento | RF-14 |
| Finalizar mantenimiento | En mantenimiento | En stock | *supuesto* |
| Dar de baja (motivo) | cualquiera | Dado de baja (definitivo) | RF-15 |
| Cambiar de proyecto | En stock | En stock | RF-03 |

Retirar, enviar a mantenimiento o dar de baja un equipo instalado cierra su instalación vigente.

## Requerimientos de logística (propuestos)

El documento original no cubre logística. Estos requerimientos se agregaron y conviene que la empresa los valide:

| Código | Requerimiento |
|---|---|
| RL-01 | Registrar bodegas (nombre único, municipio, departamento, dirección opcional). |
| RL-02 | Cada equipo tiene una ubicación física: una bodega o campo. Ingresa a una bodega. |
| RL-03 | Registrar artículos por cantidad (código único, nombre, unidad: UND, PAR, JUEGO, CAJA, ROLLO, M, KG, L). Las unidades contables no admiten decimales. |
| RL-04 | Ingreso de artículos con su factura: suma existencias en la bodega. |
| RL-05 | Despacho de bodega a proyecto: solo equipos en stock que estén en esa bodega. El equipo pasa al proyecto que lo recibe. |
| RL-06 | Traslado entre bodegas distintas: equipos en stock o en mantenimiento. |
| RL-07 | Devolución de proyecto a bodega: equipos en campo y no instalados (los instalados se retiran primero, RF-13). |
| RL-08 | Ningún movimiento deja existencias negativas. Si falla un ítem, no se mueve ninguno. |
| RL-09 | Kardex: existencias y movimientos de cada artículo. |
| RL-10 | Cada movimiento genera una guía numerada (ING-, DES-, TRA-, DEV-000001) que no se modifica ni se borra. |
| RL-11 | Consultar lo que hay en cada bodega. |

## Endpoints

| Método | Ruta | Requerimientos |
|---|---|---|
| POST | `/comandos` | Todas las escrituras |
| POST | `/comandos/validar` | RF-23 (valida sin guardar) |
| POST | `/sync/push` | RNF-01 (lote de hasta 200 operaciones) |
| GET | `/sync/cambios?desde=N` | RNF-01 (descarga incremental) |
| GET | `/sync/conflictos` · POST `/sync/conflictos/:id/resolver` | RNF-01 |
| GET | `/inventario/resumen` | RF-18 |
| GET | `/inventario/stock-por-tipo` | RF-10 |
| GET | `/equipos?estado=&tipo=&proyectoId=&ubicacion=&bodegaId=&q=&pagina=&porPagina=` | RF-04, RF-19 a RF-22 |
| GET | `/equipos/:idOSerial` | RF-16 (hoja de vida) |
| GET | `/proyectos` · `/proyectos/:id` | RF-02, RF-05 |
| GET | `/bodegas` · `/bodegas/:id` | RL-01, RL-11 |
| GET | `/articulos` · `/articulos/:id` | RL-03, RL-09 |
| GET | `/existencias?bodegaId=` o `?proyectoId=` | RL-08 |
| GET | `/movimientos?tipo=&bodegaId=&proyectoId=` · `/movimientos/:idONumero` | RL-10 |

Comandos: `CREAR_PROYECTO`, `REGISTRAR_INGRESO`, `CAMBIAR_PROYECTO`, `INSTALAR_EQUIPO`, `RETIRAR_EQUIPO`, `ENVIAR_A_MANTENIMIENTO`, `FINALIZAR_MANTENIMIENTO`, `DAR_DE_BAJA`, `CREAR_BODEGA`, `CREAR_ARTICULO`, `INGRESAR_ARTICULOS`, `REGISTRAR_DESPACHO`, `REGISTRAR_TRASLADO`, `REGISTRAR_DEVOLUCION`.

Los errores siempre tienen la forma `{ "error": { "codigo": "RF-07", "tipo": "CONFLICTO", "mensaje": "…", "detalles": [{ "campo", "problema" }] } }`, con HTTP 422 (validación), 409 (conflicto con el estado actual) o 404 (no existe). Los listados vacíos responden 200 con un `aviso`.

## Decisiones y supuestos por confirmar

Diferencias con el documento, tomadas por razones técnicas:

- Los identificadores son UUID generados en el dispositivo, no números consecutivos, para poder crear registros sin conexión.
- Cédula, teléfono, NIT y número de factura se guardan como texto, no como número, para no perder ceros iniciales. El número de factura acepta letras y guiones porque las facturas electrónicas de la DIAN llevan prefijo (`FE-1234`).
- Una compra (factura) se guarda una vez y la comparten todos los equipos y artículos de esa factura. Es única por NIT + número de factura.
- Las fechas "no futuras" se comparan con la fecha de Colombia (UTC−5), no con la UTC del servidor.

Supuestos que conviene validar con la empresa:

- **Salida de mantenimiento:** el documento no la define. Se agregó `FINALIZAR_MANTENIMIENTO` (vuelve a stock).
- **Liberación previa (RF-03):** se interpretó como "solo un equipo en stock puede cambiar de proyecto".
- **Serial único:** se compara sin espacios y sin distinguir mayúsculas.
- **Seriales de la empresa:** formato `EGT-PAN-000001`, asignado por el servidor. Un ingreso sin conexión con serial de la empresa recibe su serial al sincronizar.
- **Instalar desde bodega:** se permite instalar un equipo que sigue en bodega (queda en campo). Si la empresa exige despacharlo antes, es una regla de una línea.
- **Usuario final:** se identifica por cédula; si se instala de nuevo con otro nombre o teléfono, se actualiza al último dato.

Pendiente: garantías, PQR, reposición al usuario, disposición final, autenticación y roles. **Mientras no haya inicio de sesión, cualquiera que tenga la dirección del servidor puede usarlo**, así que no la publique en lugares abiertos.
