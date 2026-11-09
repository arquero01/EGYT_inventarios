import { existsSync, renameSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, dialog, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { iniciarServidorLocal, type ServidorLocal } from './servidor-local.ts';

/**
 * Aplicación de escritorio de eg&t. Al abrirla, el computador enciende el
 * servidor (con la base de datos en la carpeta del usuario) y muestra el
 * panel en su propia ventana. Los celulares se conectan a este computador
 * por la red local. Al cerrar la ventana se apaga el servidor.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const NOMBRE = 'eg&t Inventario';

// Una sola copia abierta: dos servidores sobre la misma base la dañarían.
const unica = app.requestSingleInstanceLock();
if (!unica) app.quit();

const carpetaDatos = () => join(app.getPath('userData'), 'datos');
const carpetaPanel = () => (app.isPackaged ? join(process.resourcesPath, 'panel') : resolve(aqui, '..', '..', 'web', 'dist'));
const icono = join(aqui, 'icono.png');

let servidor: ServidorLocal | null = null;
let ventana: BrowserWindow | null = null;
let saliendo = false;

const fechaArchivo = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 16).replace('T', '-').replace(':', '');

async function encender(restaurarDesde?: Blob) {
  servidor = await iniciarServidorLocal({
    carpetaDatos: carpetaDatos(),
    carpetaPanel: carpetaPanel(),
    puerto: 3000,
    ...(restaurarDesde ? { restaurarDesde } : {}),
  });
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: NOMBRE,
    icon: existsSync(icono) ? icono : undefined,
    backgroundColor: '#F2F7FC',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  ventana.once('ready-to-show', () => ventana?.show());
  ventana.on('page-title-updated', (e) => e.preventDefault());
  // Los enlaces externos se abren en el navegador, no dentro de la aplicación.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  ventana.webContents.on('will-navigate', (e, url) => {
    if (servidor && !url.startsWith(servidor.urlLocal)) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  void ventana.loadURL(servidor!.urlLocal);
  ventana.on('closed', () => (ventana = null));
}

// ── Menú ───────────────────────────────────────────────────────────────────

async function mostrarCelulares() {
  if (!servidor || !ventana) return;
  const direcciones = servidor.direccionesRed();
  if (direcciones.length === 0) {
    await dialog.showMessageBox(ventana, {
      type: 'warning',
      title: 'Conectar celulares',
      message: 'Este computador no está conectado a ninguna red.',
      detail: 'Conéctelo al WiFi o al cable de la oficina y vuelva a abrir esta ventana.',
    });
    return;
  }
  const principal = direcciones[0]!;
  const r = await dialog.showMessageBox(ventana, {
    type: 'info',
    title: 'Conectar celulares',
    message: `Dirección para la app:\n${principal}`,
    detail: [
      '1. Conecte el celular al mismo WiFi que este computador.',
      '2. En la app, en la pantalla de inicio de sesión, toque "Servidor".',
      `3. Escriba ${principal} y toque "Guardar y probar".`,
      '',
      'Los celulares solo se conectan mientras esta ventana esté abierta.',
      'Si Windows preguntó por el firewall, debe estar permitido en "Redes privadas".',
      ...(direcciones.length > 1 ? ['', `Otras direcciones de este computador: ${direcciones.slice(1).join(', ')}`] : []),
    ].join('\n'),
    buttons: ['Copiar dirección', 'Cerrar'],
    defaultId: 0,
    cancelId: 1,
  });
  if (r.response === 0) clipboard.writeText(principal);
}

async function guardarCopia() {
  if (!servidor || !ventana) return;
  const r = await dialog.showSaveDialog(ventana, {
    title: 'Guardar copia de seguridad',
    defaultPath: join(app.getPath('documents'), `egt-copia-${fechaArchivo()}.tar.gz`),
    filters: [{ name: 'Copia de seguridad', extensions: ['gz'] }],
  });
  if (r.canceled || !r.filePath) return;
  try {
    const copia = await servidor.respaldar();
    await writeFile(r.filePath, Buffer.from(await copia.arrayBuffer()));
    await dialog.showMessageBox(ventana, {
      type: 'info',
      title: 'Copia de seguridad',
      message: 'Copia de seguridad guardada.',
      detail: `${r.filePath}\n\nGuárdela también fuera de este computador (una memoria USB o Google Drive).`,
    });
  } catch (e) {
    dialog.showErrorBox('No se pudo guardar la copia', String(e));
  }
}

async function restaurarCopia() {
  if (!servidor || !ventana) return;
  const aviso = await dialog.showMessageBox(ventana, {
    type: 'warning',
    title: 'Restaurar copia de seguridad',
    message: 'Los datos actuales se reemplazarán por los de la copia.',
    detail: 'Los datos actuales no se borran: quedan guardados en una carpeta aparte por si los necesita.',
    buttons: ['Elegir copia…', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
  });
  if (aviso.response !== 0) return;
  const r = await dialog.showOpenDialog(ventana, {
    title: 'Elegir copia de seguridad',
    properties: ['openFile'],
    filters: [{ name: 'Copia de seguridad', extensions: ['gz', 'tgz', 'tar'] }],
  });
  const archivo = r.filePaths[0];
  if (r.canceled || !archivo) return;

  const copia = new Blob([await readFile(archivo)]);
  const actual = carpetaDatos();
  const anterior = `${actual}-anterior-${fechaArchivo()}`;
  await servidor.cerrar();
  servidor = null;
  renameSync(actual, anterior);
  try {
    await encender(copia);
  } catch (e) {
    // La copia no sirvió: se vuelve a los datos que había.
    renameSync(actual, `${actual}-copia-fallida-${fechaArchivo()}`);
    renameSync(anterior, actual);
    await encender();
    dialog.showErrorBox('No se pudo restaurar la copia', `Se mantuvieron los datos que había.\n\n${String(e)}`);
  }
  await ventana.loadURL(servidor!.urlLocal);
  if (servidor) {
    await dialog.showMessageBox(ventana, {
      type: 'info',
      title: 'Restaurar copia de seguridad',
      message: 'Listo: el sistema tiene ahora los datos de la copia.',
      detail: `Los datos anteriores quedaron en:\n${anterior}`,
    });
  }
}

function crearMenu() {
  const plantilla: MenuItemConstructorOptions[] = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Guardar copia de seguridad…', accelerator: 'CmdOrCtrl+S', click: () => void guardarCopia() },
        { label: 'Restaurar copia de seguridad…', click: () => void restaurarCopia() },
        { type: 'separator' },
        { label: 'Abrir carpeta de datos', click: () => void shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        { label: 'Salir', role: 'quit' },
      ],
    },
    {
      label: 'Celulares',
      submenu: [{ label: 'Conectar celulares…', accelerator: 'CmdOrCtrl+M', click: () => void mostrarCelulares() }],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar', role: 'reload' },
        { type: 'separator' },
        { label: 'Acercar', role: 'zoomIn' },
        { label: 'Alejar', role: 'zoomOut' },
        { label: 'Tamaño normal', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Pantalla completa', role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : ([{ type: 'separator' }, { label: 'Herramientas de desarrollo', role: 'toggleDevTools' }] as MenuItemConstructorOptions[])),
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: `Acerca de ${NOMBRE}`,
          click: () =>
            void dialog.showMessageBox(ventana!, {
              type: 'info',
              title: NOMBRE,
              message: `${NOMBRE} ${app.getVersion()}`,
              detail: `Inventario y logística de equipos de energía solar.\n\nDatos guardados en:\n${carpetaDatos()}`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

// ── Ciclo de vida ──────────────────────────────────────────────────────────

app.on('second-instance', () => {
  if (!ventana) return;
  if (ventana.isMinimized()) ventana.restore();
  ventana.focus();
});

app.whenReady().then(async () => {
  if (!unica) return;
  try {
    await encender();
  } catch (e) {
    dialog.showErrorBox(
      'No se pudo iniciar eg&t Inventario',
      `${String(e)}\n\nSi el problema sigue, cierre otros programas que usen el puerto 3000 o restaure una copia de seguridad.`,
    );
    app.quit();
    return;
  }
  crearMenu();
  crearVentana();
});

// Cerrar la ventana apaga el servidor y guarda todo antes de salir.
app.on('window-all-closed', () => app.quit());
app.on('before-quit', (e) => {
  if (saliendo || !servidor) return;
  e.preventDefault();
  saliendo = true;
  const s = servidor;
  servidor = null;
  void s.cerrar().finally(() => app.quit());
});
