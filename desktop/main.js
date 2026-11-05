import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoUpdater } from 'electron-updater';

let port;
let window;
let ollamaProcess;
let ollamaInstallerRunning = false;
let updateConfigFile;
let updaterStatus = { state: 'idle', message: 'Bit by Orbit buscará automáticamente versiones nuevas en su repositorio de GitHub.' };

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function findAvailablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '0.0.0.0', resolve); });
  const { port: available } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return available;
}

async function ollamaIsReady() {
  try { const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(900) }); return response.ok; }
  catch { return false; }
}

function findOllamaExecutable() {
  const command = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
  const lookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  const fromPath = lookup.status === 0 ? lookup.stdout.split(/\r?\n/).map((item) => item.trim()).find(Boolean) : '';
  if (fromPath) return fromPath;
  const candidates = process.platform === 'win32' ? [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe'),
  ] : process.platform === 'darwin' ? ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/Applications/Ollama.app/Contents/Resources/ollama'] : [];
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

async function startExistingOllama() {
  if (await ollamaIsReady()) return { installed: true, connected: true };
  const executable = findOllamaExecutable();
  if (!executable) return { installed: false, connected: false };
  let failedToStart = false;
  ollamaProcess = spawn(executable, ['serve'], { stdio: 'ignore', windowsHide: true });
  ollamaProcess.once('error', () => { failedToStart = true; });
  for (let attempt = 0; attempt < 35; attempt += 1) {
    if (await ollamaIsReady()) return { installed: true, connected: true };
    if (failedToStart || ollamaProcess.exitCode !== null) return { installed: true, connected: false };
    await wait(400);
  }
  return { installed: true, connected: false };
}

function publishOllamaInstallStatus(state, message) {
  window?.webContents.send('ollama:install-status', { state, message });
}

async function installOllamaWithWinget() {
  if (process.platform !== 'win32') return { ok: false, message: 'La instalación integrada de Ollama está disponible en Windows. Usa el enlace oficial para este sistema.' };
  if (await ollamaIsReady()) return { ok: true, ...(await startExistingOllama()), message: 'Ollama ya estaba instalado.' };
  if (ollamaInstallerRunning) return { ok: false, message: 'La instalación de Ollama ya está en curso.' };
  ollamaInstallerRunning = true;
  publishOllamaInstallStatus('installing', 'Descargando e instalando Ollama desde el catálogo de Windows…');
  try {
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn('winget.exe', [
        'install', '--exact', '--id', 'Ollama.Ollama', '--source', 'winget',
        '--accept-source-agreements', '--accept-package-agreements', '--silent',
      ], { windowsHide: true, stdio: 'ignore' });
      child.once('error', reject);
      child.once('close', resolve);
    });
    if (exitCode !== 0) throw new Error(`WinGet terminó con código ${exitCode}.`);
    publishOllamaInstallStatus('starting', 'Ollama quedó instalada. Iniciándola…');
    const result = await startExistingOllama();
    const message = result.connected
      ? 'Ollama está instalada y conectada. Preparando el modelo…'
      : 'Ollama quedó instalada. Si Windows pide reiniciar, hazlo y vuelve a abrir Bit by Orbit.';
    publishOllamaInstallStatus(result.connected ? 'ready' : 'installed', message);
    return { ok: true, ...result, message };
  } catch (error) {
    if (error.code === 'ENOENT') {
      await shell.openExternal('https://ollama.com/download').catch(() => {});
      const message = 'No encontré WinGet en este Windows. Abrí la descarga oficial de Ollama para que puedas instalarla manualmente.';
      publishOllamaInstallStatus('error', message);
      return { ok: false, message };
    }
    const message = `No pude instalar Ollama con WinGet: ${error.message} Abre su descarga oficial e inténtalo de nuevo.`;
    await shell.openExternal('https://ollama.com/download').catch(() => {});
    publishOllamaInstallStatus('error', message);
    return { ok: false, message };
  } finally {
    ollamaInstallerRunning = false;
  }
}

async function waitForApp() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${port}/api/status`); if (response.ok) return; } catch {}
    await wait(150);
  }
  throw new Error('Bit by Orbit no pudo iniciar su servicio local.');
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 820, minHeight: 640,
    backgroundColor: '#11120f', title: 'Bit by Orbit',
    webPreferences: { preload: path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  await window.loadURL(`http://127.0.0.1:${port}`);
}

function publishUpdateStatus(state, message, extra = {}) {
  updaterStatus = { state, message, ...extra };
  window?.webContents.send('updates:status', updaterStatus);
}

async function readUpdateConfig() {
  try {
    const saved = JSON.parse(await readFile(updateConfigFile, 'utf8'));
    if (saved?.owner && saved?.repo) return saved;
  } catch {}
  try { return JSON.parse(await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'update-config.json'), 'utf8')); }
  catch { return null; }
}

function useUpdateRepository(config) {
  autoUpdater.setFeedURL({ provider: 'github', owner: config.owner, repo: config.repo });
}

async function checkForUpdates() {
  const config = await readUpdateConfig();
  if (!config?.owner || !config?.repo) {
    publishUpdateStatus('unconfigured', 'Configura el repositorio público de GitHub donde se publicarán las versiones.');
    return { ok: false, message: updaterStatus.message };
  }
  try {
    useUpdateRepository(config);
    publishUpdateStatus('checking', 'Buscando una actualización…');
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    publishUpdateStatus('error', `No pude buscar actualizaciones: ${error.message}`);
    return { ok: false, message: error.message };
  }
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('checking-for-update', () => publishUpdateStatus('checking', 'Buscando actualizaciones…'));
autoUpdater.on('update-available', (info) => publishUpdateStatus('downloading', `Versión ${info.version} disponible. Descargándola en segundo plano…`, { version: info.version }));
autoUpdater.on('update-not-available', () => publishUpdateStatus('current', 'Bit by Orbit está actualizado.'));
autoUpdater.on('download-progress', (progress) => publishUpdateStatus('downloading', `Descargando actualización… ${Math.round(progress.percent)}%`, { percent: Math.round(progress.percent) }));
autoUpdater.on('update-downloaded', (info) => publishUpdateStatus('ready', `Versión ${info.version} lista. Reinicia Bit by Orbit ahora o se instalará al cerrar la app.`, { version: info.version }));
autoUpdater.on('error', (error) => publishUpdateStatus('error', `No pude actualizar Bit by Orbit: ${error.message}`));

ipcMain.handle('updates:get-config', async () => ({ repository: (await readUpdateConfig())?.repository || '', version: app.getVersion(), status: updaterStatus }));
ipcMain.handle('updates:configure', async (_event, input) => {
  try {
    const url = new URL(String(input || ''));
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || parts.length < 2 || !/^[\w.-]+$/.test(parts[0]) || !/^[\w.-]+$/.test(parts[1])) {
      return { ok: false, message: 'Usa la URL HTTPS de un repositorio público de GitHub, por ejemplo https://github.com/MAKN11-crypto/nexo-ai.' };
    }
    const config = { owner: parts[0], repo: parts[1].replace(/\.git$/, ''), repository: `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/, '')}` };
    await mkdir(path.dirname(updateConfigFile), { recursive: true });
    await writeFile(updateConfigFile, JSON.stringify(config, null, 2), { mode: 0o600 });
    useUpdateRepository(config);
    publishUpdateStatus('configured', 'Repositorio guardado. Las versiones públicas se buscarán automáticamente.');
    return { ok: true, repository: config.repository, status: updaterStatus };
  } catch (error) { return { ok: false, message: error.message }; }
});
ipcMain.handle('updates:check', () => checkForUpdates());
ipcMain.handle('updates:install', async () => {
  if (updaterStatus.state !== 'ready') return { ok: false, message: 'La actualización todavía no está lista.' };
  autoUpdater.quitAndInstall();
  return { ok: true };
});
ipcMain.handle('ollama:start', () => startExistingOllama());
ipcMain.handle('ollama:install', () => installOllamaWithWinget());

// Mantiene la carpeta de datos existente; productName controla el nombre visible del paquete.
app.setName('Nexo');

app.whenReady().then(async () => {
  port = await findAvailablePort();
  process.env.PORT = String(port);
  process.env.HOST = '0.0.0.0';
  process.env.NEXO_DATA_DIR = app.getPath('userData');
  updateConfigFile = path.join(app.getPath('userData'), 'update-repository.json');
  await import('../server.js');
  try {
    await waitForApp();
    await startExistingOllama();
    await createWindow();
    setTimeout(() => checkForUpdates(), 12_000);
  } catch (error) {
    await dialog.showMessageBox({ type: 'error', title: 'Bit by Orbit no pudo iniciar', message: error.message });
    app.quit();
  }
});

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (ollamaProcess && ollamaProcess.exitCode === null) ollamaProcess.kill(); });
