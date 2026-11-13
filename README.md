# EGYT_inventarios

Inventarios para la empresa prestadora de servicios eg&t: control de equipos de energía sostenible (paneles, baterías, inversores y medidores) y de la logística de bodegas, despachos, traslados y devoluciones.

El proyecto tiene cinco partes:

| Carpeta | Qué es |
|---|---|
| `packages/domain` | Reglas del negocio (estados, validaciones, mensajes). Las usan el servidor, la app y el panel. |
| `apps/api` | Servidor (API) con PostgreSQL. También sirve el panel web. |
| `apps/mobile` | App Android para campo (React Native con Expo SDK 57). Funciona sin señal. |
| `apps/web` | Panel web para la oficina (React + Vite). |
| `apps/desktop` | Aplicación de escritorio para Windows (Electron): el computador guarda los datos y hace de servidor. |

## Imagen

El panel y la app usan el logo de eg&t (`apps/web/public/logo-egt.png` y `apps/mobile/assets/logo-egt.png`) y sus azules: `#0093FF`, `#22A5FF`, `#39AFFF` y `#5AC3FF`, con azul noche `#0A2540` para menús y encabezados. Para botones y enlaces se usa `#006FC8`, el mismo azul más profundo, porque el del logo no alcanza a leerse bien con letra blanca. Verde (instalado) y ámbar (mantenimiento, pendiente) quedan solo para los estados. El ícono de la app se generó con el logo; con una versión del logo en mayor tamaño o en vector (SVG) quedaría más nítido.

## Importar equipos desde Excel

En el panel: **Equipos → Importar desde Excel**.

1. **Descargar plantilla** trae la hoja *Equipos* con los encabezados, las *Instrucciones* de cada columna y la lista de *Proyectos y bodegas* que ya existen.
2. Llénela (una fila por equipo) o use su propia hoja: las columnas se reconocen aunque tengan nombres parecidos («Número de serie», «Referencia», «Precio»…) y los encabezados no tienen que estar en la primera fila. Desde Google Sheets: **Archivo → Descargar → Microsoft Excel (.xlsx)**.
3. Súbala. El panel revisa cada fila con las mismas reglas del ingreso manual y muestra los errores por columna (tipo no válido, NIT incorrecto, proyecto o bodega que no existen, serial repetido en el archivo…).
4. **Importar** guarda las filas correctas una por una; las que tienen errores no se guardan. Con **Descargar filas por corregir** obtiene un Excel solo con esas filas y el motivo, para corregirlas y subirlas de nuevo.

Detalles: serial vacío → el sistema asigna uno de la empresa; unidad vacía → la habitual del tipo (W para paneles e inversores, Ah para baterías de gel, kWh para litio, A para medidores y controladores); fechas como `15/03/2026` o fecha de Excel; valores como `520000`, `520.000` o `$ 520.000`. Máximo 2000 equipos por archivo. Reintentar un archivo no duplica los equipos que ya se guardaron en ese intento.

### El archivo de inventario de la empresa

El archivo que ya maneja la empresa (*COMPRAS_INVENTARIOS_UNIFICADOS*, hoja **Histórico**) se sube en la misma pantalla y el panel lo reconoce solo por sus encabezados (CÓDIGO INTERNO, TIPO DE EQUIPO, CENTRO DE COSTOS…). Si el archivo tiene varias hojas con ese formato, se elige cuál importar. Solo un administrador puede importarlo.

| En el archivo | En el sistema |
| --- | --- |
| Código interno (`EG&T-BGEL-0051`) | Identificador del equipo. Sin código: el serial del fabricante, y si tampoco hay, uno de la empresa (`EGT-…`) |
| Serial | Serial del fabricante (se puede buscar) |
| Centro de costos | **Zona** (una zona puede tener varios proyectos). El proyecto queda «por completar» |
| Usuario (cédula), NIU, nombre, fecha de entrega | Usuario final e instalación. Si la cédula ya existe, se reutiliza |
| Estado y notas (`PERDIDOS`, `DISP FINAL`, `PRESENTAN FALLAS`, `DISPONIBLE`…) | Perdido o disposición final → dado de baja · daño o garantía → en mantenimiento · disponible → en stock (en la bodega que se elija) · lo demás → instalado |
| Descripción | Descripción, y de ahí la potencia o capacidad (`TB12-200` → 200 Ah, `1.000W` → 1000 W, `3072WH` → 3072 Wh) |
| Proveedor, ID factura, fecha de compra, valor, fin de garantía | Compra y garantía. «TB PLUS» y «TBPLUS» quedan como el mismo proveedor; fechas de texto en orden mes/día/año |

Lo que falta o viene como `PENDIENTE`, `PDTE…`, `En Espera`, `#N/D` o `-` queda en la lista **«por completar»** del equipo. En **Equipos** el filtro *Revisión* muestra los que tienen datos por completar, los que no tienen proyecto o los de garantía vencida o por vencer, y el filtro *Zona* los de cada centro de costos. En la hoja de vida, **Asignar proyecto** ubica un equipo del histórico en su proyecto (también si ya está instalado).

No se importan las filas sin tipo de equipo, con un tipo que no existe en el sistema (por ejemplo «CABLE SOLAR») o con un código interno repetido en el archivo: **Descargar filas por revisar** las entrega con el motivo, junto con las que quedaron con datos por completar. Volver a subir el mismo archivo no duplica nada: el panel reconoce las filas que ya se guardaron. Con el archivo de prueba (2.094 filas) se importaron 2.073 equipos en unos 35 segundos.

**Celdas de color.** Las celdas pintadas en el archivo (amarillo, rojo, verde, naranja…) quedan en el equipo como «por verificar», por ejemplo *Verificar (amarillo): Nombre*; si casi toda la fila está pintada, *Verificar (rojo): toda la fila*. No cuentan el blanco ni los tintes casi blancos que trae el formato de la hoja, ni las celdas pintadas fuera de la tabla. Si el archivo ya se había importado antes, al subirlo de nuevo solo se agregan esas marcas a los equipos que ya estaban. En **Equipos → Revisión → Celdas de color por verificar** salen todos.

## Editar los datos de un equipo

En la hoja de vida del equipo, **Editar datos** (solo administradores) permite corregir lo que vino mal del Excel o completar lo que faltaba: código o serial, serial del fabricante, tipo, marca, modelo, potencia, descripción, zona, fin de garantía, compra (proveedor, NIT, factura, fecha, valor) y usuario final (cédula, nombre, teléfono, NIU, fecha de entrega).

- Cada cambio queda en el **historial** con el valor anterior y el nuevo, quién lo hizo y el motivo.
- Lo que se llena se quita solo de «por completar». Los «Verificar…» se quitan desmarcándolos cuando ya se revisaron.
- La factura la comparten varios equipos: corregirla en uno no cambia la de los demás.
- Una cédula distinta cambia la persona a la que se entregó; a un equipo que venía sin usuario se le registra la entrega.
- El estado y la ubicación no se editan aquí: se cambian con las acciones (instalar, mantenimiento…) y las guías.
- Un equipo dado de baja sigue sin poder modificarse (RF-15), salvo los que vinieron del histórico, para corregir sus datos (no su estado).

## Aplicación de escritorio (Windows)

Con la aplicación de escritorio, **el computador de la oficina hace de servidor**: guarda los datos, muestra el panel en su propia ventana y los celulares se conectan a él por el WiFi. No depende de Codespaces ni de internet.

**Instalar**
1. En GitHub: **Releases → Aplicación de escritorio para Windows → `EGT-Inventario-instalador.exe`**. GitHub la arma sola cada vez que cambia el código (pestaña **Actions → Escritorio Windows**).
2. Abra el instalador. Como no está firmado, Windows puede mostrar *«Windows protegió su PC»*: toque **Más información → Ejecutar de todas formas**.
3. La primera vez que se abre, Windows pregunta por el **firewall**: marque **Redes privadas** y permita el acceso. Sin eso los celulares no se conectan.
4. Cree la primera cuenta: quedará como administrador.

**Conectar los celulares**
- Menú **Celulares → Conectar celulares…** muestra la dirección (algo como `http://192.168.1.20:3000`) y permite copiarla.
- El celular debe estar en el **mismo WiFi**. En la app: *Servidor* → escriba esa dirección → **Guardar y probar**.
- Los celulares solo se conectan **mientras la ventana esté abierta**: al cerrarla se apaga el servidor (los celulares guardan lo que hagan y lo envían cuando vuelva a estar abierta).
- Si la dirección del computador cambia cada día, pida en el router una **IP fija** (reserva DHCP) para ese computador.

**Datos y copias de seguridad**
- Los datos quedan en `%APPDATA%\EGT Inventario\datos` y **no se borran al desinstalar**.
- **Archivo → Guardar copia de seguridad…** genera un `.tar.gz`. Guárdelo también fuera del computador (USB, Drive).
- **Archivo → Restaurar copia de seguridad…** reemplaza los datos por los de una copia; los anteriores quedan en una carpeta aparte.

**Pasar los datos de Codespaces al computador**
1. En el Codespace, detenga el servidor (**Ctrl + C**) y ejecute `pnpm respaldo`. Se crea `egt-copia-AAAA-MM-DD-HHMM.tar.gz` en la raíz del proyecto.
2. Clic derecho sobre ese archivo en el explorador de VS Code → **Download**.
3. En la aplicación de escritorio: **Archivo → Restaurar copia de seguridad…** y elija el archivo.

**Desarrollo:** `pnpm escritorio` compila el panel y abre la aplicación. `pnpm --filter @egt/desktop instalador` arma el instalador (en Windows).

## Cuentas de usuario

Todos entran con **correo y contraseña**. Quien no tiene cuenta se registra desde la app o el panel.

- **La primera persona que se registra queda como administrador.** Las demás quedan como usuario.
- **Usuario:** consulta y registra todas las operaciones (ingresos, despachos, instalaciones, mantenimiento…).
- **Administrador:** además da de baja equipos, autoriza, desactiva o cambia el rol de las cuentas, restablece contraseñas olvidadas (genera una temporal) y marca como revisadas las operaciones rechazadas al sincronizar.
- **Cuentas por autorizar.** Quien se registra queda «por autorizar» y entra como **usuario**. Un administrador la autoriza (o la rechaza) en **Cuentas** y ahí mismo le da el rol con la lista *Rol*. El menú muestra cuántas cuentas esperan. (Solo para pruebas: `REGISTRO_REQUIERE_APROBACION=false` en `apps/api/.env` deja entrar de una vez.)
- **Cuenta principal.** La de logística (`logistica@egyt.com.co`; si no existe, el administrador más antiguo; en una base nueva, la primera cuenta que se registra). Siempre es administradora: nadie puede desactivarla, quitarle el rol ni generarle otra contraseña; su contraseña solo se cambia desde **Mi cuenta**.
- Siempre queda al menos un administrador activo. Desactivar una cuenta cierra sus sesiones de inmediato.
- Cada operación queda firmada en el servidor con la cuenta que la hizo; no se puede registrar a nombre de otra persona.
- Las contraseñas se guardan cifradas con scrypt (nunca en texto). La sesión dura 30 días; la app la guarda en el celular para seguir trabajando sin señal. Hay un límite de intentos fallidos para frenar a quien intente adivinar contraseñas.

## Panel web (oficina)

Al ejecutar `pnpm build` (o `pnpm build:web`), el servidor sirve el panel en su misma dirección: abra `http://localhost:3000` (o la dirección pública del Codespace) en el navegador.

| Sección | Qué hace |
|---|---|
| Inicio | Dónde están los equipos (en stock, instalados, mantenimiento, baja; en bodega o en campo), stock por tipo, últimas guías y, para administradores, cuentas por autorizar y operaciones rechazadas |
| Equipos | Tabla con búsqueda por serial, nombre o **cédula del usuario final** y filtros por tipo, estado, bodega y proyecto; hoja de vida con historial y acciones (instalar, retirar, mantenimiento, cambio de proyecto, baja) |
| Ingreso de equipo | Formulario por unidad con la opción de seguir con la siguiente unidad de la misma factura |
| Importar desde Excel | Carga masiva desde un archivo .xlsx (Excel o Google Sheets descargado) o .csv, con revisión fila por fila antes de guardar. Reconoce también el archivo de inventario de la empresa (hoja «Histórico») |
| Proyectos, Bodegas, Artículos | Listas, fichas, kardex e ingreso de artículos con factura |
| Guías | Todas las guías numeradas; despacho, traslado y devolución con equipos y artículos en una misma guía; la guía se puede imprimir |
| Cuentas | Solo administradores |
| Mi cuenta | Cambiar contraseña y cerrar sesión |

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
   `pnpm dev` compila el panel web y luego enciende el servidor.
   El servidor queda en el puerto 3000, con PostgreSQL embebido. Los datos se guardan en `apps/api/.pglite`.
2. En la pestaña **Puertos**, clic derecho sobre el **3000** → **Visibilidad del puerto** → **Público**.
3. Copie la **dirección reenviada** (algo como `https://nombre-del-codespace-3000.app.github.dev`).
4. **Panel:** abra esa dirección en el navegador y cree la primera cuenta (quedará como administrador).
5. **App:** en la pantalla de inicio de sesión toque *Servidor*, pegue la dirección → **Guardar y probar** → entre o regístrese.

Codespaces se apaga tras 30 minutos sin actividad. Mientras tanto, la app sigue funcionando: muestra los últimos datos guardados y deja las operaciones en cola hasta que el servidor vuelva. Para uso diario, el servidor debe ir en un hosting permanente con PostgreSQL (ver *Producción*).

## Desarrollo

Requiere Node.js 22 o superior y pnpm 12 (`npm install -g pnpm`).

```bash
pnpm install
pnpm dev          # compila el panel y enciende la API en http://localhost:3000 (PostgreSQL embebido)
pnpm dev:api      # solo la API, sin recompilar el panel
pnpm dev:web      # panel en http://localhost:5173 (con recarga al guardar; usa la API del puerto 3000)
pnpm build:web    # compila el panel para que la API lo sirva en http://localhost:3000
pnpm escritorio   # abre la aplicación de escritorio (Electron)
pnpm respaldo     # copia de seguridad de la base embebida (con el servidor apagado)
pnpm test         # pruebas del dominio, la API y la app
pnpm typecheck    # revisión de tipos de todo el proyecto
```

La app se prueba en un celular con Android Studio o con `pnpm --filter @egt/mobile android` (necesita el SDK de Android instalado).

### Producción

Con un PostgreSQL real: copie `apps/api/.env.example` a `apps/api/.env`, ponga `DATABASE_URL=postgres://…` y ejecute:

```bash
pnpm build                          # panel web + servidor
pnpm --filter @egt/api migrate:prod
pnpm start
```

Publique el servidor solo con **HTTPS** (las contraseñas viajan en cada inicio de sesión).

Para desarrollo local con PostgreSQL: `docker compose up -d`. Para correr las pruebas contra un PostgreSQL real (borra el esquema `public` de esa base): `TEST_DATABASE_URL=postgres://usuario@localhost:5432/egt_pruebas pnpm test`.

## La app

| Pestaña | Funciones |
|---|---|
| Inicio | Resumen del inventario (RF-18), stock por tipo (RF-10), operaciones pendientes y accesos rápidos |
| Inventario | Búsqueda (RF-22), filtros por estado, tipo y ubicación (RF-19 a RF-21) y hoja de vida (RF-16, RF-17) con sus acciones: instalar, retirar, mantenimiento, baja y cambio de proyecto (RF-03, RF-11 a RF-15) |
| Proyectos | Lista con resumen (RF-05), ficha y equipos del proyecto (RF-02, RF-04), creación (RF-01) |
| Logística | Ingreso de equipos y de artículos, despachos, traslados, devoluciones, bodegas, kardex de artículos y guías |
| Ajustes | Mi cuenta (cambiar contraseña, cerrar sesión), dirección del servidor, cola sin conexión y operaciones rechazadas |

Antes de las pestañas, la app pide **iniciar sesión** o **registrarse**. Si la sesión vence o un administrador desactiva la cuenta, la app vuelve a esa pantalla sin perder las operaciones pendientes: se envían al entrar de nuevo. *Dar de baja* solo aparece para administradores.

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

Todas las rutas, salvo `/salud` y las de registro e ingreso, exigen el encabezado `Authorization: Bearer <token>`.

| Método | Ruta | Requerimientos |
|---|---|---|
| GET | `/auth/opciones` | Si el registro requiere autorización |
| POST | `/auth/registro` · `/auth/ingresar` | Crear cuenta · iniciar sesión (devuelven el token) |
| GET | `/auth/yo` · POST `/auth/salir` · POST `/auth/contrasena` | Cuenta actual, cerrar sesión, cambiar contraseña |
| GET | `/usuarios` · PATCH `/usuarios/:id` · POST `/usuarios/:id/restablecer` | Solo administradores |
| POST | `/comandos` | Todas las escrituras |
| POST | `/comandos/validar` | RF-23 (valida sin guardar) |
| POST | `/sync/push` | RNF-01 (lote de hasta 200 operaciones) |
| GET | `/sync/cambios?desde=N` | RNF-01 (descarga incremental) |
| GET | `/sync/conflictos` · POST `/sync/conflictos/:id/resolver` (administrador) | RNF-01 |
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

Los errores siempre tienen la forma `{ "error": { "codigo": "RF-07", "tipo": "CONFLICTO", "mensaje": "…", "detalles": [{ "campo", "problema" }] } }`, con HTTP 422 (validación), 409 (conflicto con el estado actual), 404 (no existe), 401 (falta iniciar sesión o venció), 403 (el rol no alcanza) o 429 (demasiados intentos). Los listados vacíos responden 200 con un `aviso`.

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

- **Búsqueda por cédula:** se agregó para atender las PQR (el técnico encuentra los equipos del usuario que llama).
- **Contraseña olvidada:** no hay envío de correos; el administrador genera una contraseña temporal y se la entrega a la persona.

Pendiente: garantías, PQR, reposición al usuario y disposición final.
