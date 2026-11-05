import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import updaterPackage from 'electron-updater';

const { autoUpdater } = updaterPackage;

let port;
let window;
let ollamaProcess;
let ollamaInstallerRunning = false;
let updateConfigFile;
let providerSecretsFile;
const providerSecretCache = new Map();
const providerRequests = new Map();
let updaterStatus = { state: 'idle', message: 'Bit by Orbit buscará automáticamente versiones nuevas en su repositorio de GitHub.' };

const providerEndpoints = {
  gemini: { label: 'Gemini', models: 'https://generativelanguage.googleapis.com/v1beta/models', kind: 'gemini' },
  openai: { label: 'OpenAI API', models: 'https://api.openai.com/v1/models', kind: 'openai' },
  anthropic: { label: 'Claude', models: 'https://api.anthropic.com/v1/models?limit=100', kind: 'anthropic' },
};

function validProvider(provider) { return Object.hasOwn(providerEndpoints, provider); }
function providerStorageAvailable() {
  try { return safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text'; }
  catch { return false; }
}
function providerHeaders(provider, key) {
  if (provider === 'gemini') return { 'x-goog-api-key': key };
  if (provider === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  return { Authorization: `Bearer ${key}` };
}
async function loadProviderSecrets() {
  if (providerSecretCache.size) return providerSecretCache;
  if (!providerSecretsFile || !providerStorageAvailable()) return providerSecretCache;
  try {
    const encrypted = JSON.parse(await readFile(providerSecretsFile, 'utf8'));
    for (const [provider, value] of Object.entries(encrypted)) {
      if (validProvider(provider) && typeof value === 'string') providerSecretCache.set(provider, safeStorage.decryptString(Buffer.from(value, 'base64')));
    }
  } catch {}
  return providerSecretCache;
}
function redactProviderSecret(message, key) { return String(message || '').slice(0, 500).replaceAll(String(key || ''), '[clave oculta]'); }
async function saveProviderSecrets() {
  if (!providerSecretsFile || !providerStorageAvailable()) return false;
  const encrypted = {};
  for (const [provider, key] of providerSecretCache) encrypted[provider] = safeStorage.encryptString(key).toString('base64');
  await mkdir(path.dirname(providerSecretsFile), { recursive: true });
  const temporary = `${providerSecretsFile}.tmp`;
  await writeFile(temporary, JSON.stringify(encrypted), { mode: 0o600 });
  await rename(temporary, providerSecretsFile);
  return true;
}
async function fetchProviderModels(provider, key) {
  const definition = providerEndpoints[provider];
  const response = await fetch(definition.models, { headers: providerHeaders(provider, key), signal: AbortSignal.timeout(15_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(redactProviderSecret(data.error?.message || data.error?.status || `El proveedor respondió ${response.status}.`, key));
  const items = provider === 'gemini'
    ? (data.models || []).filter((item) => (item.supportedGenerationMethods || []).includes('generateContent')).map((item) => String(item.name || '').replace(/^models\//, ''))
    : (data.data || []).map((item) => String(item.id || item.name || ''));
  return [...new Set(items)].filter((item) => item && item.length <= 150 && !/embedding|audio|tts|transcri|moderation/i.test(item)).slice(0, 100);
}
function providerError(data, status, key) {
  const message = data?.error?.message || data?.message || `El proveedor respondió ${status}.`;
  return redactProviderSecret(message, key);
}
async function generateWithProvider(input, signal) {
  const provider = String(input.provider || '');
  if (!validProvider(provider)) throw new Error('Proveedor externo no disponible.');
  const secrets = await loadProviderSecrets();
  const key = secrets.get(provider);
  if (!key) throw new Error(`Conecta ${providerEndpoints[provider].label} en Modelos externos primero.`);
  const model = String(input.model || '').trim().slice(0, 150);
  if (!model) throw new Error('Selecciona un modelo conectado.');
  const system = String(input.system || '').slice(0, 8_000);
  const history = Array.isArray(input.history) ? input.history.slice(-12).map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '').slice(0, 24_000) })) : [];
  const messages = [...history, { role: 'user', content: String(input.prompt || '').slice(0, 30_000) }];
  const images = Array.isArray(input.images) ? input.images.slice(0, 2).filter((item) => ['image/jpeg', 'image/png', 'image/webp'].includes(item?.mime) && /^[A-Za-z0-9+/]+=*$/.test(String(item.data || '')) && String(item.data).length <= 1_500_000).map((item) => ({ mime: item.mime, data: String(item.data) })) : [];
  let endpoint;
  let body;
  const headers = { ...providerHeaders(provider, key), 'Content-Type': 'application/json' };
  if (provider === 'gemini') {
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    body = { ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents: messages.map((item, index) => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.content }, ...(index === messages.length - 1 ? images.map((image) => ({ inline_data: { mime_type: image.mime, data: image.data } })) : [])] })), generationConfig: { temperature: 0.4 } };
  } else if (provider === 'anthropic') {
    endpoint = 'https://api.anthropic.com/v1/messages';
    body = { model, max_tokens: 2_048, ...(system ? { system } : {}), messages: messages.map((item, index) => ({ role: item.role, content: index === messages.length - 1 && images.length ? [{ type: 'text', text: item.content }, ...images.map((image) => ({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } }))] : item.content })) };
  } else {
    endpoint = 'https://api.openai.com/v1/chat/completions';
    body = { model, messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((item, index) => ({ role: item.role, content: index === messages.length - 1 && images.length ? [{ type: 'text', text: item.content }, ...images.map((image) => ({ type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.data}` } }))] : item.content }))], stream: false };
  }
  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(providerError(data, response.status, key));
  const content = provider === 'gemini'
    ? (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('')
    : provider === 'anthropic'
      ? (data.content || []).map((part) => part.text || '').join('')
      : typeof data.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content : (data.choices?.[0]?.message?.content || []).map((part) => part.text || '').join('');
  if (!content) throw new Error('El proveedor no devolvió texto. Revisa el modelo y los límites de tu cuenta.');
  return { content, provider, model };
}

// Mantiene la carpeta existente de datos y muestra la marca actual en el sistema.
app.setName('Bit by Orbit');

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
  if (process.platform === 'darwin' && config?.macAutoUpdates !== true) {
    const message = 'Esta versión de Mac no tiene firma Developer ID de Apple. macOS no permite instalar sus actualizaciones con seguridad; no se descargará un paquete que termine como “damaged”.';
    publishUpdateStatus('signature-required', message);
    return { ok: false, message };
  }
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
      return { ok: false, message: 'Usa la URL HTTPS de un repositorio público de GitHub, por ejemplo https://github.com/usuario/bit-by-orbit.' };
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
ipcMain.handle('providers:list', async () => {
  const secrets = await loadProviderSecrets();
  return { secureStorage: providerStorageAvailable(), providers: Object.keys(providerEndpoints).map((id) => ({ id, name: providerEndpoints[id].label, connected: secrets.has(id) })) };
});
ipcMain.handle('providers:models', async (_event, providerInput) => {
  const provider = String(providerInput || '');
  if (!validProvider(provider)) return { ok: false, message: 'Proveedor no reconocido.' };
  const secrets = await loadProviderSecrets(); const key = secrets.get(provider);
  if (!key) return { ok: false, message: 'Conecta este proveedor primero.' };
  try { return { ok: true, models: await fetchProviderModels(provider, key) }; }
  catch (error) { return { ok: false, message: error.message || 'No se pudieron actualizar los modelos.' }; }
});
ipcMain.handle('providers:connect', async (_event, input) => {
  const provider = String(input?.provider || ''); const key = String(input?.key || '').trim();
  if (!validProvider(provider)) return { ok: false, message: 'Proveedor no reconocido.' };
  if (key.length < 12 || key.length > 500) return { ok: false, message: 'Revisa la clave y vuelve a intentarlo.' };
  try {
    const models = await fetchProviderModels(provider, key);
    if (!models.length) return { ok: false, message: 'La clave se aceptó, pero la cuenta no mostró modelos de texto disponibles.' };
    providerSecretCache.set(provider, key);
    const encrypted = await saveProviderSecrets();
    return { ok: true, provider, models, secureStorage: encrypted };
  } catch (error) { return { ok: false, message: error.message || 'No se pudo conectar con el proveedor.' }; }
});
ipcMain.handle('providers:disconnect', async (_event, providerInput) => {
  const provider = String(providerInput || '');
  if (!validProvider(provider)) return { ok: false, message: 'Proveedor no reconocido.' };
  await loadProviderSecrets(); providerSecretCache.delete(provider);
  try { await saveProviderSecrets(); } catch (error) { return { ok: false, message: error.message }; }
  return { ok: true };
});
ipcMain.handle('providers:generate', async (_event, input) => {
  const requestId = String(input?.requestId || ''); const controller = new AbortController();
  if (requestId) providerRequests.set(requestId, controller);
  try { return { ok: true, ...await generateWithProvider(input || {}, controller.signal) }; }
  catch (error) { return { ok: false, message: error.name === 'AbortError' ? 'Respuesta detenida.' : error.message || 'No se pudo consultar el proveedor.' }; }
  finally { if (requestId) providerRequests.delete(requestId); }
});
ipcMain.on('providers:cancel', (_event, requestId) => providerRequests.get(String(requestId || ''))?.abort());

app.whenReady().then(async () => {
  app.setPath('userData', path.join(app.getPath('appData'), 'Nexo'));
  port = await findAvailablePort();
  process.env.PORT = String(port);
  process.env.HOST = '0.0.0.0';
  process.env.NEXO_DATA_DIR = app.getPath('userData');
  updateConfigFile = path.join(app.getPath('userData'), 'update-repository.json');
  providerSecretsFile = path.join(app.getPath('userData'), 'provider-secrets.json');
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
