const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = 'nexo.workspace.v1';
const defaultAgents = [
  { id: 'coordinator', name: 'Asistente principal', emoji: '✳', color: 'lime', description: 'Coordina tus ideas y encuentra el siguiente paso.', instruction: '' },
  { id: 'researcher', name: 'Investigación', emoji: '⌕', color: 'green', description: 'Investiga, compara y explica con claridad.', instruction: 'Eres un agente de investigación. Ordena la pregunta, explica qué sabes y distingue hechos de dudas. No inventes fuentes ni datos.' },
  { id: 'builder', name: 'Desarrollo', emoji: '⌘', color: 'violet', description: 'Resuelve problemas técnicos y convierte ideas en código.', instruction: 'Eres un agente de desarrollo. Propón pasos concretos, código cuando se solicite y señala dependencias o límites técnicos.' },
  { id: 'strategist', name: 'Estrategia', emoji: '◈', color: 'amber', description: 'Evalúa opciones y transforma objetivos en planes.', instruction: 'Eres un agente de estrategia. Evalúa objetivos, opciones, riesgos y el siguiente paso más útil con claridad.' },
  { id: 'creative', name: 'Creatividad', emoji: '✧', color: 'pink', description: 'Explora alternativas originales y propuestas realizables.', instruction: 'Eres un agente creativo. Genera opciones originales, pero conviértelas en propuestas realizables y explica brevemente cómo empezar.' },
];
let store = loadStore();
let selectedAgent = 'coordinator';
let statusSnapshot = { connected: false, models: [], settings: { endpoint: 'http://127.0.0.1:11434', model: '' } };
let workspaceSyncReady = false;
let workspaceSyncTimer;
let activeGeneration;
let activeModelPull;
let pendingDocuments = [];
let voiceModeEnabled = false;
let voiceRecognition = null;
let voiceTranscript = '';
let lastWorkspaceRevision = 0;
let lastWorkspaceClearedAt = 0;
let ownerProfileSaveTimer;
let ownerProfileLoaded = false;
let ownerWebLearningEnabled = true;
let autoLearningInterval;
let autoLearningBusy = false;
let lastAutoLearningCheck = 0;

function loadStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const customAgents = Array.isArray(saved?.agents) ? saved.agents.filter((agent) => agent?.custom) : [];
    return { threads: Array.isArray(saved?.threads) ? saved.threads : [], agents: [...defaultAgents, ...customAgents], skills: Array.isArray(saved?.skills) ? saved.skills.slice(0, 100) : [], activeId: saved?.activeId || null, memory: Array.isArray(saved?.memory) ? saved.memory.slice(0, 30) : [], learnEnabled: saved?.learnEnabled !== false };
  } catch { return { threads: [], agents: defaultAgents, skills: [], activeId: null, memory: [], learnEnabled: true }; }
}
function persist(options = {}) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ownerProfileLoaded ? { ...store, memory: [], learnEnabled: false } : store)); } catch {}
  if (options.sync !== false && workspaceSyncReady) {
    clearTimeout(workspaceSyncTimer);
    workspaceSyncTimer = setTimeout(syncWorkspaceToServer, 450);
  }
  if (options.profile !== false && statusSnapshot.owner && ownerProfileLoaded) {
    clearTimeout(ownerProfileSaveTimer);
    ownerProfileSaveTimer = setTimeout(() => fetch('/api/owner/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memory: store.memory, learnEnabled: store.learnEnabled, webLearningEnabled: ownerWebLearningEnabled }) }).catch(() => {}), 450);
  }
}
async function loadOwnerProfile() {
  if (!statusSnapshot.owner) {
    ownerProfileLoaded = false;
    const visibleThreads = store.threads.filter((thread) => thread.owner === false);
    const visibleSkills = store.skills.filter((skill) => skill.state === 'active');
    const changed = visibleThreads.length !== store.threads.length || visibleSkills.length !== store.skills.length || store.memory.length > 0 || store.learnEnabled || store.agents.some((agent) => agent.custom);
    store.threads = visibleThreads;
    if (!store.threads.some((thread) => thread.id === store.activeId)) store.activeId = store.threads[0]?.id || null;
    store.skills = visibleSkills; store.agents = defaultAgents; store.memory = []; store.learnEnabled = false; ownerWebLearningEnabled = false;
    if (changed) persist({ sync: false, profile: false });
    renderMemoryPanel();
    return;
  }
  try {
    const response = await fetch('/api/owner/profile');
    if (!response.ok) return;
    const profile = await response.json();
    const legacyMemory = store.memory;
    store.memory = Array.isArray(profile.memory) ? profile.memory.slice(0, 30) : [];
    store.learnEnabled = profile.learnEnabled !== false;
    ownerWebLearningEnabled = profile.webLearningEnabled !== false;
    ownerProfileLoaded = true;
    if (!store.memory.length && statusSnapshot.ownerPairCode && legacyMemory.length) store.memory = legacyMemory;
    persist({ sync: false, profile: false });
    renderMemoryPanel();
    if (!profile.memory?.length && statusSnapshot.ownerPairCode && legacyMemory.length) persist({ sync: false });
  } catch {}
}
function mergeRemoteWorkspace(remote) {
  lastWorkspaceRevision = Number(remote.revision) || lastWorkspaceRevision;
  let changed = false;
  if (Number(remote.clearedAt) > lastWorkspaceClearedAt) {
    store.threads = [];
    store.activeId = null;
    lastWorkspaceClearedAt = Number(remote.clearedAt);
    changed = true;
  }
  const byId = new Map(store.threads.map((thread) => [thread.id, thread]));
  for (const incoming of remote.threads || []) {
    const local = byId.get(incoming.id);
    if (!local) { store.threads.push(incoming); byId.set(incoming.id, incoming); changed = true; }
    else if (!local.pending && Number(incoming.updated) > Number(local.updated)) { Object.assign(local, incoming); changed = true; }
  }
  const agentIds = new Set(store.agents.map((agent) => agent.id));
  for (const agent of remote.agents || []) if (agent.custom && !agentIds.has(agent.id)) { store.agents.push(agent); agentIds.add(agent.id); changed = true; }
  for (const skill of remote.skills || []) {
    const localIndex = store.skills.findIndex((item) => item.id === skill.id);
    if (localIndex < 0) { store.skills.push(skill); changed = true; }
    else if (Number(skill.updated) > Number(store.skills[localIndex].updated)) { store.skills[localIndex] = skill; changed = true; }
  }
  if (changed) { persist({ sync: false }); render(); }
}
async function syncWorkspaceToServer() {
  try {
    const response = await fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threads: store.threads, agents: store.agents.filter((agent) => agent.custom), skills: store.skills }) });
    if (response.ok) mergeRemoteWorkspace(await response.json());
  } catch {}
}
async function syncWorkspaceFromServer() {
  try {
    const response = await fetch('/api/workspace');
    if (!response.ok) return;
    mergeRemoteWorkspace(await response.json());
    workspaceSyncReady = true;
    await syncWorkspaceToServer();
    window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const latest = await fetch('/api/workspace', { headers: lastWorkspaceRevision ? { 'If-None-Match': `"workspace-${lastWorkspaceRevision}"` } : {} });
        if (latest.ok) mergeRemoteWorkspace(await latest.json());
      } catch {}
    }, 5000);
  } catch { workspaceSyncReady = true; }
}
function currentThread() { return store.threads.find((thread) => thread.id === store.activeId); }
function agentFor(id) { return store.agents.find((agent) => agent.id === id) || defaultAgents[0]; }
function safe(text) { return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function markdown(text) {
  return safe(text)
    .replace(/```(?:[\w+-]+)?\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}
function shortTitle(text) { const clean = text.trim().replace(/\s+/g, ' '); return clean.length > 34 ? `${clean.slice(0, 34)}…` : clean || 'Nuevo chat'; }
function makeId() { return crypto.randomUUID(); }
function learnFromUserText(text) {
  if (!statusSnapshot.owner || !store.learnEnabled) return;
  const patterns = [
    /\b(?:recuerda(?:me)? que|acuérdate que|para futuras conversaciones)\s+([^.!?\n]{5,240})/i,
    /\b(?:no me gusta|prefiero|me gusta|me interesa)\s+([^.!?\n]{5,200})/i,
  ];
  const sensitive = /\b(?:contraseñ(?:a|as)|password|tarjeta|cvv|cuenta bancaria|número de cuenta|api key|token|código de acceso|domicilio|dirección exacta|curp|pasaporte)\b/i;
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    const note = match?.[1]?.trim().replace(/\s+/g, ' ');
    if (!note || sensitive.test(note)) continue;
    const normalized = note.toLocaleLowerCase('es-MX');
    if (store.memory.some((item) => item.text.toLocaleLowerCase('es-MX') === normalized)) continue;
    store.memory.unshift({ id: makeId(), text: note, created: Date.now() });
    store.memory = store.memory.slice(0, 30);
  }
}
function recallContext(query, currentThreadId) {
  if (!statusSnapshot.owner || !ownerProfileLoaded || !store.learnEnabled) return '';
  const fixed = store.memory.slice(0, 20).map((item) => `- ${item.text}`);
  const stop = new Set('para como donde cuando quien quienes cual cuales esto esta estos esas ellos ellas con sin sobre entre desde hasta hacia porque pero una uno unos unas los las del de la el en y o que es soy tengo quieres quiero ayuda hacer decir dame pueden puede puedes mucho mas muy tan por mi me te tu sus nuestro nuestra'.split(' '));
  const terms = [...new Set(String(query).toLocaleLowerCase('es-MX').match(/[\p{L}\p{N}]{4,}/gu) || [])].filter((term) => !stop.has(term));
  const documents = store.threads.filter((thread) => thread.id !== currentThreadId && thread.owner !== false)
    .sort((a, b) => Number(b.updated) - Number(a.updated))
    .flatMap((thread) => {
      const documents = []; let previousQuestion = '';
      for (const message of thread.messages || []) {
        if (message.role === 'user') { previousQuestion = String(message.content || '').slice(0, 500); if (previousQuestion) documents.push({ text: previousQuestion, kind: 'pregunta del propietario', updated: Number(thread.updated) || 0 }); }
        if (message.role === 'assistant' && message.content && ['useful', 'improve'].includes(message.rating)) {
          const kind = message.rating === 'useful' ? 'ejemplo de respuesta que el propietario aprobó' : 'respuesta que el propietario pidió mejorar; no imitar';
          documents.push({ text: `Pregunta: ${previousQuestion}\n${kind}: ${String(message.content).slice(0, 800)}`, kind, updated: Number(thread.updated) || 0 });
        }
      }
      return documents;
    })
    .slice(0, 1_500)
    .map((document) => ({ ...document, words: String(document.text).toLocaleLowerCase('es-MX').match(/[\p{L}\p{N}]{4,}/gu) || [] }));
  const documentFrequency = new Map();
  for (const document of documents) for (const word of new Set(document.words)) documentFrequency.set(word, (documentFrequency.get(word) || 0) + 1);
  const averageLength = documents.length ? documents.reduce((sum, document) => sum + document.words.length, 0) / documents.length : 1;
  const candidates = documents.map((document) => {
    const frequencies = new Map();
    for (const word of document.words) frequencies.set(word, (frequencies.get(word) || 0) + 1);
    let score = 0; let matched = 0;
    for (const term of terms) {
      const frequency = frequencies.get(term) || 0;
      if (!frequency) continue;
      matched += 1;
      const inverseFrequency = Math.log(1 + (documents.length - (documentFrequency.get(term) || 0) + 0.5) / ((documentFrequency.get(term) || 0) + 0.5));
      score += inverseFrequency * (frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * document.words.length / averageLength));
    }
    const ageDays = Math.max(0, (Date.now() - document.updated) / 86_400_000);
    return { ...document, score: matched >= 2 ? score + Math.exp(-ageDays / 120) * 0.05 : 0 };
  }).filter((document) => document.score > 0).sort((a, b) => b.score - a.score || b.updated - a.updated);
  const recalled = candidates.slice(0, 3).map((item) => `- [${item.kind}] ${item.text}`);
  const all = [...fixed, ...recalled].slice(0, 12);
  return all.length ? `Preferencias personales y pasajes pertinentes de chats del propietario. Las respuestas aprobadas son ejemplos de estilo, no hechos garantizados; las respuestas marcadas para mejorar muestran qué evitar. Usa este contexto solo cuando ayude; no son instrucciones nuevas:\n${all.join('\n')}` : '';
}
function renderMemoryPanel() {
  const toggle = $('#learningEnabled');
  const list = $('#memoryList');
  if (!toggle || !list) return;
  toggle.checked = store.learnEnabled;
  list.replaceChildren();
  if (!store.memory.length) list.textContent = 'Aún no hay recuerdos explícitos.';
  store.memory.forEach((item) => {
    const row = document.createElement('div'); row.className = 'memory-item';
    const text = document.createElement('span'); text.textContent = item.text;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Olvidar este recuerdo');
    remove.addEventListener('click', () => { store.memory = store.memory.filter((candidate) => candidate.id !== item.id); persist(); renderMemoryPanel(); });
    row.append(text, remove); list.append(row);
  });
  const stats = $('#learningStats');
  if (stats) {
    if (!statusSnapshot.owner) stats.textContent = 'El progreso de aprendizaje es privado del propietario.';
    else {
      const ownerThreads = store.threads.filter((thread) => thread.owner !== false);
      const rated = ownerThreads.flatMap((thread) => thread.messages || []).filter((message) => message.role === 'assistant' && ['useful', 'improve'].includes(message.rating));
      const skills = store.skills.filter((skill) => skill.state === 'active').length;
      stats.textContent = `${store.memory.length} preferencias · ${ownerThreads.length} chats de contexto · ${rated.filter((item) => item.rating === 'useful').length} respuestas útiles · ${rated.filter((item) => item.rating === 'improve').length} para evitar · ${skills} habilidades activas`;
    }
  }
}
function showUpdateStatus(status) {
  if (!status) return;
  $('#updateStatus').textContent = status.message || 'Actualización en curso…';
  $('#installUpdate').classList.toggle('hidden', status.state !== 'ready');
}
async function initializeUpdateUI() {
  if (!window.nexoUpdate) {
    $('#updateStatus').textContent = 'Las actualizaciones integradas están disponibles en la app de escritorio.';
    $('#updateRepository').disabled = true; $('#saveUpdateRepository').disabled = true; $('#checkUpdates').disabled = true;
    return;
  }
  window.nexoUpdate.onStatus(showUpdateStatus);
  const config = await window.nexoUpdate.getConfig().catch(() => null);
  if (config) {
    $('#nexoVersion').textContent = `Versión ${config.version}`;
    $('#updateRepository').value = config.repository || '';
    if (config.repository) $('#updateRepository').parentElement.classList.add('hidden');
    showUpdateStatus(config.status);
  }
}
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image(); const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) return reject(new Error('No pude procesar la imagen.'));
        const reader = new FileReader(); reader.onload = () => resolve({ type: 'image', name: file.name, mime: 'image/jpeg', data: String(reader.result).split(',')[1] }); reader.onerror = reject; reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.76);
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('El formato de imagen no se pudo leer.')); };
    image.src = url;
  });
}

function createThread(agentId = selectedAgent) {
  const thread = { id: makeId(), title: 'Nuevo chat', agent: agentId, owner: statusSnapshot.owner === true, messages: [], updated: Date.now() };
  store.threads.unshift(thread); store.activeId = thread.id; selectedAgent = agentId; persist(); render(); $('#prompt').focus();
}
function openThread(id) { store.activeId = id; const thread = currentThread(); if (thread) selectedAgent = thread.agent; persist(); render(); }
function renderList() {
  const list = $('#conversationList');
  list.replaceChildren();
  const terms = ($('#chatSearch')?.value || '').trim().toLocaleLowerCase('es-MX').split(/\s+/).filter(Boolean);
  const threads = [...store.threads].sort((a, b) => b.updated - a.updated);
  const matches = threads.filter((thread) => {
    if (!terms.length) return true;
    const title = String(thread.title || '').toLocaleLowerCase('es-MX');
    if (terms.every((term) => title.includes(term))) return true;
    return (thread.messages || []).some((message) => {
      const content = `${message.content || ''} ${message.context || ''}`.toLocaleLowerCase('es-MX');
      return terms.every((term) => content.includes(term));
    });
  });
  if (!matches.length) {
    const empty = document.createElement('div');
    empty.className = 'conversation-empty';
    empty.textContent = terms.length ? 'No se encontraron chats.' : 'Tus conversaciones aparecerán aquí.';
    list.append(empty);
  }
  const grouped = new Map();
  matches.slice(0, 40).forEach((thread) => {
    const key = thread.agent || 'coordinator';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(thread);
  });
  [...grouped.entries()]
    .sort((a, b) => (b[1][0]?.updated || 0) - (a[1][0]?.updated || 0))
    .forEach(([agentId, items]) => {
      const agent = agentFor(agentId);
      const group = document.createElement('section');
      group.className = 'conversation-group';
      group.innerHTML = `<div class="conversation-group-title"><span class="conversation-mark ${safe(agent.color)}">${safe(agent.emoji)}</span><strong>${safe(agent.name)}</strong><small>${items.length}</small></div>`;
      items.forEach((thread) => {
        const button = document.createElement('button');
        button.className = `conversation ${thread.id === store.activeId ? 'selected' : ''}`;
        button.innerHTML = `<span class="conversation-title">${safe(thread.title)}</span>`;
        button.addEventListener('click', () => { openThread(thread.id); closeMobileSidebar(); });
        group.append(button);
      });
      list.append(group);
    });
  $('#chatCount').textContent = String(store.threads.length);
}
function renderMessages() {
  const thread = currentThread();
  const messages = $('#messages');
  messages.replaceChildren();
  const empty = !thread || !thread.messages.length;
  $('#welcome').classList.toggle('hidden', !empty || $('#agentsView').classList.contains('hidden') === false);
  $('#composer').classList.toggle('hidden', !$('#agentsView').classList.contains('hidden'));
  if (empty) { $('#threadName').textContent = thread?.title || 'Nuevo chat'; return; }
  $('#threadName').textContent = thread.title;
  const lastUserIndex = thread.messages.reduce((latest, item, index) => item.role === 'user' ? index : latest, -1);
  for (const message of thread.messages) {
    const row = document.createElement('article'); row.className = `message-row ${message.role}`;
    const index = thread.messages.indexOf(message);
    if (message.role === 'user') {
      const attachments = message.attachments?.length ? `<div class="message-attachments">${message.attachments.map((item) => `<span>${item.type === 'image' ? '▧' : '▤'} ${safe(item.name || item)}</span>`).join('')}</div>` : '';
      const editAction = index === lastUserIndex && !thread.pending ? `<div class="message-actions"><button type="button" data-edit-message="${index}">Editar</button></div>` : '';
      row.innerHTML = `<div class="message-user-wrap">${attachments}<div class="message-user-bubble">${safe(message.content)}</div>${editAction}</div>`;
    } else {
      const steps = message.steps?.length ? `<details class="team-details"><summary>Ver aportes de ${message.steps.length} agentes</summary>${message.steps.map((step) => `<div class="team-step"><strong>${safe(step.agent)}${step.computer ? ` <small>· ${safe(step.computer)}</small>` : ''}</strong><p>${safe(step.content)}</p></div>`).join('')}</details>` : '';
      const sources = Array.isArray(message.sources) ? message.sources.map((source) => {
        try { const url = new URL(source.url); if (!['http:', 'https:'].includes(url.protocol)) return ''; return `<a href="${safe(url.href)}" target="_blank" rel="noopener noreferrer"><strong>${safe(source.title)}</strong><small>${safe(source.snippet || source.url)}</small></a>`; } catch { return ''; }
      }).join('') : '';
      const sourcePanel = sources ? `<details class="web-sources"><summary>Fuentes web (${message.sources.length})</summary>${sources}</details>` : '';
      const status = message.pending && !message.content ? `<div class="typing-dots"><i></i><i></i><i></i><span>${safe(message.status || 'Pensando…')}</span></div>` : '';
      const contextNotice = message.contextNotice ? `<div class="context-notice">ⓘ ${safe(message.contextNotice)}</div>` : '';
      const provenance = message.provenance ? `<div class="response-provenance">${message.provenance.locality === 'local' ? 'En este equipo' : safe(message.provenance.provider || 'Proveedor externo')}${message.provenance.model ? ` · ${safe(message.provenance.model)}` : ''}</div>` : '';
      const feedback = message.pending || !message.content ? '' : `<button type="button" data-rating-message="${index}" data-rating="useful" aria-pressed="${message.rating === 'useful'}" title="Marcar como útil">👍</button><button type="button" data-rating-message="${index}" data-rating="improve" aria-pressed="${message.rating === 'improve'}" title="Marcar para mejorar">👎</button>`;
      const regenerateAction = message.pending || !message.content ? '' : `<button type="button" data-regenerate-message="${index}">↻ Regenerar</button>`;
      row.innerHTML = `<div class="message-avatar">${safe(agentFor(message.agent || 'coordinator').emoji)}</div><div class="message-content"><div class="message-author">${safe(agentFor(message.agent || 'coordinator').name)}</div><div class="message-text">${markdown(message.content)}</div>${status}${contextNotice}${steps}${sourcePanel}${provenance}<div class="message-actions"><button type="button" data-speak-message="${index}">◖ Escuchar</button><button type="button" data-copy-message="${index}">Copiar</button>${regenerateAction}${feedback}</div></div>`;
    }
    messages.append(row);
  }
  messages.scrollTop = messages.scrollHeight;
  messages.querySelectorAll('[data-copy-message]').forEach((button) => button.addEventListener('click', async () => {
    const answer = currentThread()?.messages[Number(button.dataset.copyMessage)]?.content || '';
    try { await navigator.clipboard.writeText(answer); button.textContent = 'Copiado'; setTimeout(() => { button.textContent = 'Copiar respuesta'; }, 1500); } catch {}
  }));
  messages.querySelectorAll('[data-edit-message]').forEach((button) => button.addEventListener('click', () => {
    const thread = currentThread(); const index = Number(button.dataset.editMessage); const message = thread?.messages[index];
    if (!thread || !message || message.role !== 'user') return;
    pendingDocuments = restoreAttachments(message);
    thread.messages = thread.messages.slice(0, index); thread.pending = false; thread.updated = Date.now();
    selectedAgent = thread.agent; persist(); render(); renderFileTray();
    $('#prompt').value = message.content; autoResize(); $('#prompt').focus();
  }));
  messages.querySelectorAll('[data-regenerate-message]').forEach((button) => button.addEventListener('click', () => {
    const thread = currentThread(); const index = Number(button.dataset.regenerateMessage); const answer = thread?.messages[index];
    if (!thread || !answer || answer.role !== 'assistant') return;
    const userIndex = thread.messages.slice(0, index).map((item) => item.role).lastIndexOf('user');
    const prompt = thread.messages[userIndex];
    if (!prompt || userIndex < 0) return;
    pendingDocuments = restoreAttachments(prompt); thread.messages = thread.messages.slice(0, userIndex); thread.pending = false; thread.updated = Date.now();
    selectedAgent = answer.agent || thread.agent; $('#teamMode').checked = Boolean(answer.team);
    persist(); render(); renderFileTray(); sendMessage(prompt.content);
  }));
  messages.querySelectorAll('[data-speak-message]').forEach((button) => button.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const answer = currentThread()?.messages[Number(button.dataset.speakMessage)]?.content || '';
    const utterance = new SpeechSynthesisUtterance(answer); utterance.lang = 'es-MX'; window.speechSynthesis.speak(utterance);
  }));
  messages.querySelectorAll('[data-rating-message]').forEach((button) => button.addEventListener('click', () => {
    const message = currentThread()?.messages[Number(button.dataset.ratingMessage)];
    if (!message) return;
    const rating = button.dataset.ratingMessage ? button.dataset.rating : '';
    if (message.rating === rating) delete message.rating;
    else { message.rating = rating; message.ratedAt = new Date().toISOString(); }
    const thread = currentThread(); if (thread) thread.updated = Date.now();
    persist(); renderMessages(); updateFeedbackCount();
  }));
}
function restoreAttachments(message) {
  const documents = [];
  if (message.context) documents.push({ name: message.attachments?.filter((item) => item.type !== 'image').map((item) => item.name).join(', ') || 'Contexto de archivos anteriores', text: message.context });
  for (const image of message.images || []) documents.push({ type: 'image', name: image.name || 'Imagen anterior', mime: image.mime || 'image/jpeg', data: image.data });
  return documents.slice(0, 4);
}
function getRatedExamples() {
  return store.threads.flatMap((thread) => thread.owner === false ? [] : thread.messages.flatMap((message, index) => {
    if (message.role !== 'assistant' || !['useful', 'improve'].includes(message.rating) || !message.content || message.pending) return [];
    // Only locally generated answers may be exported for model evaluation/training.
    if (message.provenance && message.provenance.provider !== 'ollama') return [];
    const previous = [...thread.messages.slice(0, index)].reverse().find((item) => item.role === 'user');
    if (!previous) return [];
    return [{ rating: message.rating, input: `${previous.content || ''}${previous.attachments?.length ? '\n[Se adjuntó un archivo; su contenido no se incluye en esta exportación.]' : ''}`, output: message.content, agent: agentFor(message.agent || 'coordinator').name, provider: message.provenance?.provider || 'ollama', model: message.provenance?.model || statusSnapshot.settings?.model || null, teamMode: Boolean(message.steps?.length), ratedAt: message.ratedAt || null }];
  }));
}
function updateFeedbackCount() {
  const count = getRatedExamples().length;
  const button = $('#exportFeedback');
  if (!button) return;
  button.disabled = count === 0;
  $('#feedbackCount').textContent = `${count} ${count === 1 ? 'respuesta marcada' : 'respuestas marcadas'}`;
}
function exportFeedback() {
  const examples = getRatedExamples();
  if (!examples.length) return;
  const blob = new Blob([examples.map((example) => JSON.stringify(example)).join('\n')], { type: 'application/x-ndjson' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `nexo-ejemplos-${new Date().toISOString().slice(0, 10)}.jsonl`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportWorkspaceBackup() {
  const backup = { format: 'nexo-workspace', version: 1, exportedAt: new Date().toISOString(), threads: store.threads, agents: store.agents.filter((agent) => agent.custom), skills: store.skills, memory: store.memory, learnEnabled: store.learnEnabled };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `nexo-respaldo-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importWorkspaceBackup(file) {
  if (!file || file.size > 75 * 1024 * 1024) throw new Error('El respaldo supera el límite de 75 MB.');
  const backup = JSON.parse(await file.text());
  if (backup?.format !== 'nexo-workspace' || backup.version !== 1 || !Array.isArray(backup.threads) || backup.threads.length > 2000) throw new Error('El archivo no es un respaldo de Nexo compatible.');
  const validThreads = backup.threads.filter((thread) => thread && typeof thread.id === 'string' && typeof thread.title === 'string' && Array.isArray(thread.messages) && thread.messages.length <= 2000 && thread.messages.every((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string'));
  const existing = new Set(store.threads.map((thread) => thread.id));
  const imported = validThreads.filter((thread) => { if (existing.has(thread.id)) return false; existing.add(thread.id); return true; });
  const agents = Array.isArray(backup.agents) ? backup.agents.filter((agent) => agent?.custom && typeof agent.id === 'string' && typeof agent.name === 'string' && typeof agent.instruction === 'string') : [];
  const agentIds = new Set(store.agents.map((agent) => agent.id));
  const skills = Array.isArray(backup.skills) ? backup.skills.filter((skill) => typeof skill?.id === 'string' && typeof skill.name === 'string' && typeof skill.instructions === 'string') : [];
  const skillIds = new Set(store.skills.map((skill) => skill.id));
  store.threads.push(...imported);
  store.threads.sort((a, b) => (Number(b.updated) || 0) - (Number(a.updated) || 0));
  store.agents.push(...agents.filter((agent) => !agentIds.has(agent.id)));
  store.skills.push(...skills.filter((skill) => !skillIds.has(skill.id)));
  const memories = Array.isArray(backup.memory) ? backup.memory.filter((item) => typeof item?.text === 'string' && item.text.length <= 240) : [];
  const memoryIds = new Set(store.memory.map((item) => item.id));
  store.memory = [...store.memory, ...memories.filter((item) => !memoryIds.has(item.id))].slice(-30);
  persist(); render(); renderMemoryPanel();
  return { imported: imported.length, skipped: backup.threads.length - imported.length, agents: agents.length, skills: skills.length };
}
function renderAgents() {
  const specialties = {
    coordinator: ['Planificación', 'Seguimiento'],
    researcher: ['Búsqueda', 'Síntesis'],
    builder: ['Desarrollo', 'Depuración'],
    strategist: ['Análisis', 'Decisiones'],
    creative: ['Ideas', 'Guiones'],
  };
  $('#agentMenu').innerHTML = store.agents.map((agent) => `<button type="button" data-agent="${safe(agent.id)}"><span class="agent-chip ${safe(agent.color)}">${safe(agent.emoji)}</span><span>${safe(agent.name)}</span></button>`).join('');
  $('#agentGrid').innerHTML = store.agents.map((agent) => {
    const count = store.threads.filter((thread) => thread.agent === agent.id).length;
    const tags = specialties[agent.id] || ['Personalizado'];
    return `<article class="agent-card"><div class="agent-card-top"><span class="agent-card-icon ${safe(agent.color)}">${safe(agent.emoji)}</span>${agent.custom ? '<span class="custom-tag">PROPIO</span>' : ''}</div><h3>${safe(agent.name)}</h3><p>${safe(agent.description)}</p><div class="agent-specialties">${tags.map((tag) => `<span>${safe(tag)}</span>`).join('')}<small>${count} ${count === 1 ? 'chat' : 'chats'}</small></div><button class="agent-open" data-open-agent="${safe(agent.id)}">Abrir chat <span>↗</span></button></article>`;
  }).join('');
  $('#agentMenu').querySelectorAll('[data-agent]').forEach((button) => button.addEventListener('click', () => { selectedAgent = button.dataset.agent; $('#selectedAgentName').textContent = agentFor(selectedAgent).name; $('#agentMenu').classList.add('hidden'); if (!currentThread() || currentThread().messages.length) createThread(selectedAgent); else { currentThread().agent = selectedAgent; persist(); } }));
  $('#agentGrid').querySelectorAll('[data-open-agent]').forEach((button) => button.addEventListener('click', () => { selectedAgent = button.dataset.openAgent; createThread(selectedAgent); setView('chats'); }));
}
function renderSkills() {
  const list = $('#skillList');
  if (!list) return;
  list.replaceChildren();
  updateOwnerControls();
  const autoToggle = $('#autoWebLearning');
  if (autoToggle) autoToggle.checked = ownerWebLearningEnabled;
  if (!store.skills.length) { list.textContent = 'Aún no hay habilidades. Describe una para que Nexo prepare un borrador.'; return; }
  store.skills.forEach((skill) => {
    const card = document.createElement('article'); card.className = 'skill-card';
    const heading = document.createElement('div'); heading.className = 'skill-card-heading';
    const name = document.createElement('strong'); name.textContent = skill.name;
    const state = document.createElement('span'); state.className = `skill-state ${skill.state === 'active' ? 'active' : ''}`; state.textContent = skill.state === 'active' ? 'Activa' : 'Borrador';
    heading.append(name, state);
    const description = document.createElement('p'); description.textContent = `${skill.description || 'Habilidad reutilizable'}${skill.autoUpdate ? ' · Actualización automática para revisar' : ''}`;
    const sources = document.createElement('div'); sources.className = 'skill-sources';
    (skill.sources || []).forEach((source) => { try { const url = new URL(source.url); if (!['http:', 'https:'].includes(url.protocol)) return; const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = source.title || url.hostname; sources.append(link); } catch {} });
    if (statusSnapshot.owner) {
      const actions = document.createElement('div'); actions.className = 'skill-actions';
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'secondary-button'; toggle.textContent = skill.state === 'active' ? 'Pausar' : 'Revisar y activar';
      toggle.addEventListener('click', () => {
        if (skill.state !== 'active' && !confirm(`¿Activar “${skill.name}” para que Nexo use estas instrucciones en chats relacionados? Revisa sus fuentes primero.`)) return;
        if (skill.state !== 'active' && skill.autoUpdate && skill.originSkillId) {
          const previous = store.skills.find((item) => item.id === skill.originSkillId);
          if (previous) { previous.state = 'draft'; previous.updated = Date.now(); }
        }
        skill.state = skill.state === 'active' ? 'draft' : 'active'; skill.updated = Date.now(); persist(); renderSkills();
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Eliminar';
      remove.addEventListener('click', () => { store.skills = store.skills.filter((item) => item.id !== skill.id); persist(); renderSkills(); });
      actions.append(toggle, remove); card.append(heading, description, sources, actions);
    } else card.append(heading, description, sources);
    list.append(card);
  });
}
function updateOwnerControls() {
  const owner = statusSnapshot.owner === true; const code = statusSnapshot.ownerPairCode || '';
  $('#ownerAccessMessage').textContent = owner ? (code ? 'Este equipo es propietario. Usa este código para desbloquear tus otros dispositivos.' : 'Sesión de propietario activa en este dispositivo.') : 'Solo el propietario puede crear, activar o borrar habilidades.';
  $('#ownerPairCode').textContent = code;
  $('#ownerCodeRow').classList.toggle('hidden', !code);
  $('#ownerUnlockRow').classList.toggle('hidden', owner);
  $('#ownerLock').classList.toggle('hidden', !owner || Boolean(code));
  $('#skillGoal').disabled = !owner; $('#learnSkill').disabled = !owner;
  $('#learningEnabled').disabled = !owner; $('#memoryInput').disabled = !owner; $('#saveMemory').disabled = !owner; $('#clearMemory').disabled = !owner;
  $('#autoWebLearning').disabled = !owner;
}
async function runAutomaticLearning() {
  if (!statusSnapshot.owner || !ownerProfileLoaded || !ownerWebLearningEnabled || autoLearningBusy || !statusSnapshot.connected || !statusSnapshot.settings?.model) return;
  if (Date.now() - lastAutoLearningCheck < 3 * 60 * 60_000) return;
  const pendingRefreshes = new Set(store.skills.filter((skill) => skill.state === 'draft' && skill.autoUpdate && skill.originSkillId).map((skill) => skill.originSkillId));
  const candidate = store.skills.filter((skill) => skill.state === 'active' && !pendingRefreshes.has(skill.id) && Date.now() - (Number(skill.lastAutoReview) || 0) >= 12 * 60 * 60_000).sort((a, b) => (Number(a.lastAutoReview) || 0) - (Number(b.lastAutoReview) || 0))[0];
  if (!candidate) return;
  lastAutoLearningCheck = Date.now(); autoLearningBusy = true;
  const status = $('#autoLearningStatus');
  if (status) status.textContent = `Investigando novedades de “${candidate.name}” con búsqueda web y tu modelo local…`;
  try {
    const response = await fetch('/api/learning/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skillId: candidate.id }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo actualizar el conocimiento.');
    if (result.status === 'draft' && result.skill) {
      store.skills = [result.skill, ...store.skills.filter((skill) => skill.id !== result.skill.id)].slice(0, 100);
      persist(); renderSkills();
      if (status) status.textContent = `Nexo preparó una actualización de “${candidate.name}”. Revisa el borrador y sus fuentes para activarla.`;
    } else if (status) status.textContent = result.status === 'current' ? `“${candidate.name}” sigue al día; revisaré otra habilidad más tarde.` : `Revisé “${candidate.name}”; no encontré novedades suficientes para proponer un cambio.`;
  } catch (error) { if (status) status.textContent = error.message; }
  finally { autoLearningBusy = false; }
}
function startAutomaticLearning() {
  if (autoLearningInterval) return;
  runAutomaticLearning();
  autoLearningInterval = setInterval(runAutomaticLearning, 5 * 60_000);
}
function matchingSkills(prompt) {
  const query = String(prompt || '').toLocaleLowerCase('es-MX');
  return store.skills.filter((skill) => skill.state === 'active' && (skill.triggers || []).some((trigger) => trigger.length > 2 && query.includes(trigger.toLocaleLowerCase('es-MX')))).slice(0, 2).map(({ id, name, instructions }) => ({ id, name, instructions }));
}
function render() {
  renderList(); renderMessages(); renderAgents(); renderSkills();
  renderMemoryPanel();
  updateFeedbackCount();
  const thread = currentThread();
  selectedAgent = thread?.agent || selectedAgent;
  $('#selectedAgentName').textContent = agentFor(selectedAgent).name;
}
function setView(view) {
  const agents = view === 'agents';
  $('#agentsView').classList.toggle('hidden', !agents);
  $('#chatView').classList.toggle('hidden', agents);
  $('#viewName').textContent = agents ? 'Agentes' : 'Chats';
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  if (agents) $('#threadName').textContent = `${store.agents.length} agentes`;
}
function setConnection(connected, label, model = '') {
  $('#localDot').classList.toggle('online', connected);
  $('#connectionLabel').textContent = label;
  $('#modelLabel').textContent = model || (connected ? 'Motor local conectado' : 'Sin motor local');
}
async function refreshStatus() {
  try {
    const response = await fetch('/api/status');
    statusSnapshot = await response.json();
    await loadOwnerProfile();
    const models = statusSnapshot.models || [];
    const canManage = statusSnapshot.owner === true;
    for (const selector of ['#endpointInput', '#modelSelect', '#refreshModels', '#saveSettings', '#nodeNameInput', '#nodeEndpointInput', '#addNode', '#catalogSelect']) {
      const control = $(selector);
      if (control) control.disabled = !canManage;
    }
    const select = $('#modelSelect');
    const savedModel = statusSnapshot.settings?.model || '';
    const activeModel = savedModel && models.includes(savedModel) ? savedModel : models[0] || '';
    $('#modelOrigin').textContent = activeModel
      ? `Modelo disponible en este equipo: ${activeModel}. Sus respuestas salen de sus parámetros entrenados y del contexto de este chat.`
      : 'Todavía no hay un modelo instalado. Al descargar uno, sus respuestas saldrán de sus parámetros entrenados y del contexto de este chat.';
    $('#runtimeSetup').classList.toggle('hidden', statusSnapshot.connected);
    $('#downloadModel').disabled = !statusSnapshot.connected || !canManage;
    const hardware = statusSnapshot.hardware || {};
    $('#hostSpecs').textContent = `${statusSnapshot.computer || 'Equipo anfitrión'} · ${hardware.memoryGB || '?'} GB RAM · ${hardware.platform || 'sistema local'}`;
    if (!$('#catalogSelect').dataset.initialized) {
      $('#catalogSelect').value = Number(hardware.memoryGB) >= 24 ? 'qwen3.5:9b' : 'qwen3.5:4b';
      $('#catalogSelect').dataset.initialized = 'true';
    }
    select.replaceChildren(new Option(models.length ? 'Selecciona un modelo' : 'No hay modelos instalados', ''));
    models.forEach((model) => select.add(new Option(model, model)));
    if (savedModel && models.includes(savedModel)) select.value = savedModel;
    $('#endpointInput').value = statusSnapshot.settings?.endpoint || 'http://127.0.0.1:11434';
    const links = statusSnapshot.access?.links || [];
    $('#shareLinks').replaceChildren();
    if (statusSnapshot.access?.enabled && links.length) {
      links.forEach((url) => { const link = document.createElement('a'); link.href = url; link.textContent = url.replace(/\?key=.*/, ''); link.target = '_blank'; link.rel = 'noreferrer'; $('#shareLinks').append(link); });
      $('#copyDeviceLink').dataset.url = links[0];
      $('#copyDeviceLink').disabled = false;
    } else {
      $('#shareLinks').textContent = 'Conexión entre dispositivos disponible en la app de escritorio.';
      $('#copyDeviceLink').disabled = true;
    }
    setConnection(statusSnapshot.connected, statusSnapshot.connected ? 'Conectado' : 'Equipo listo', savedModel || (models[0] ? `${models.length} modelos disponibles` : 'Configura un modelo local'));
    renderNodes();
    renderSkills();
  } catch { setConnection(false, 'App fuera de línea', ''); }
}
function renderNodes() {
  const list = $('#nodeList');
  if (!list) return;
  list.replaceChildren();
  const nodes = statusSnapshot.nodes || [];
  if (!statusSnapshot.owner) { list.textContent = 'Solo el propietario puede ver o cambiar los equipos conectados.'; return; }
  if (!nodes.length) { list.textContent = 'Aún no hay equipos añadidos.'; return; }
  nodes.forEach((node) => {
    const row = document.createElement('div'); row.className = 'node-row';
    const details = document.createElement('div'); details.className = 'node-details';
    const name = document.createElement('strong'); name.textContent = node.name;
    const endpoint = document.createElement('small'); endpoint.textContent = node.endpoint;
    const modelReady = !node.model || node.models.includes(node.model);
    const state = document.createElement('span'); state.className = `node-state ${node.connected && modelReady ? 'connected' : ''}`;
    state.textContent = !node.connected ? 'Sin conexión' : modelReady ? `Conectado · ${node.models.length} modelos` : 'Modelo elegido no instalado';
    details.append(name, endpoint, state);
    const model = document.createElement('select'); model.className = 'field node-model'; model.setAttribute('aria-label', `Modelo para ${node.name}`);
    model.add(new Option('Elegir automáticamente', ''));
    if (node.model && !node.models.includes(node.model)) model.add(new Option(`${node.model} · no instalado`, node.model));
    node.models.forEach((item) => model.add(new Option(item, item)));
    model.value = node.model || '';
    model.disabled = !node.connected;
    model.addEventListener('change', () => {
      const next = (statusSnapshot.settings.nodes || []).map((item) => item.id === node.id ? { ...item, model: model.value } : item);
      saveNodes(next);
    });
    const remove = document.createElement('button'); remove.className = 'node-remove'; remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Quitar ${node.name}`);
    remove.addEventListener('click', () => saveNodes((statusSnapshot.settings.nodes || []).filter((item) => item.id !== node.id)));
    row.append(details, model, remove); list.append(row);
  });
}
async function saveNodes(nodes) {
  const message = $('#nodeMessage'); message.textContent = 'Guardando equipos…';
  try {
    const response = await fetch('/api/settings/nodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodes }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudieron guardar los equipos.');
    await refreshStatus(); message.textContent = 'Lista actualizada. Los equipos conectados aparecerán disponibles en modo equipo.';
    return true;
  } catch (error) { message.textContent = error.message; return false; }
}
async function sendMessage(text = $('#prompt').value) {
  let prompt = text.trim(); if (!prompt && !pendingDocuments.length) return;
  if (!prompt && pendingDocuments.some((document) => document.type === 'image')) prompt = 'Describe y analiza la imagen adjunta.';
  if (!currentThread()) createThread(selectedAgent);
  const thread = currentThread();
  const memory = recallContext(prompt, thread.id);
  const skills = matchingSkills(prompt);
  learnFromUserText(prompt);
  renderMemoryPanel();
  thread.agent = selectedAgent; thread.title = thread.messages.length ? thread.title : shortTitle(prompt); thread.updated = Date.now();
  const history = thread.messages.filter((item) => item.role === 'user' || item.role === 'assistant').map((item) => ({ role: item.role, content: item.context ? `${item.content}\n\nDocumento adjunto anterior:\n${item.context}` : item.content, images: item.images?.map((image) => image.data) || [] }));
  const documents = pendingDocuments.splice(0);
  const context = documents.filter((document) => document.type !== 'image').map((document) => `--- ${document.name} ---\n${document.text}`).join('\n\n');
  const images = documents.filter((document) => document.type === 'image').map(({ name, mime, data }) => ({ name, mime, data }));
  thread.messages.push({ role: 'user', content: prompt, attachments: documents.map(({ name, type }) => ({ name, type })), context, images }); thread.pending = true; thread.team = $('#teamMode').checked;
  const assistantMessage = { role: 'assistant', agent: selectedAgent, content: '', steps: [], sources: [], team: thread.team, pending: true, status: thread.team ? 'Reuniendo al equipo…' : 'Pensando…' };
  thread.messages.push(assistantMessage);
  $('#prompt').value = ''; autoResize(); renderFileTray(); persist(); render(); $('#sendButton').disabled = true; $('#stopButton').classList.remove('hidden');
  activeGeneration = new AbortController();
  let lastPaint = 0;
  try {
    const response = await fetch('/api/chat', { method: 'POST', signal: activeGeneration.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, context, memory, skills, images: images.map((image) => ({ mime: image.mime, data: image.data })), history, agent: selectedAgent, agentInstruction: agentFor(selectedAgent).instruction, team: thread.team, webSearch: $('#webMode').checked }) });
    if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'No se pudo responder.'); }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'token') {
          assistantMessage.content += event.content;
          if (Date.now() - lastPaint > 90) { renderMessages(); lastPaint = Date.now(); }
          continue;
        }
        if (event.type === 'agent_start') assistantMessage.status = `Pensando: ${event.agent}${event.computer ? ` en ${event.computer}` : ''}…`;
        if (event.type === 'agent_done') { assistantMessage.steps.push({ agent: event.agent, content: event.content, computer: event.computer }); assistantMessage.status = 'El equipo compara sus ideas…'; }
        if (event.type === 'synthesizing') assistantMessage.status = 'Preparando una respuesta conjunta…';
        if (event.type === 'status') assistantMessage.status = event.message;
        if (event.type === 'sources') assistantMessage.sources = event.sources || [];
        if (event.type === 'done') { assistantMessage.content = event.content; assistantMessage.steps = event.steps || assistantMessage.steps; assistantMessage.sources = event.sources || assistantMessage.sources; assistantMessage.contextNotice = event.contextNotice || ''; assistantMessage.provenance = event.provenance || null; assistantMessage.pending = false; }
        if (event.type === 'error') throw new Error(event.message || 'No se pudo responder.');
        persist(); renderMessages();
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const event = JSON.parse(buffer);
      if (event.type === 'done') { assistantMessage.content = event.content; assistantMessage.steps = event.steps || assistantMessage.steps; assistantMessage.sources = event.sources || assistantMessage.sources; assistantMessage.contextNotice = event.contextNotice || ''; assistantMessage.provenance = event.provenance || null; }
      if (event.type === 'error') throw new Error(event.message || 'No se pudo responder.');
    }
  } catch (error) {
    assistantMessage.content = `${assistantMessage.content ? `${assistantMessage.content}\n\n` : ''}${error.name === 'AbortError' ? 'Respuesta detenida.' : `No pude completar la respuesta. ${error.message}\n\nAbre Ajustes para conectar el motor local y elegir un modelo.`}`;
  } finally {
    assistantMessage.pending = false; thread.pending = false; thread.updated = Date.now(); activeGeneration = null; persist(); render(); $('#sendButton').disabled = false; $('#stopButton').classList.add('hidden'); $('#prompt').focus();
    if (voiceModeEnabled) {
      if (assistantMessage.content && !assistantMessage.content.startsWith('No pude completar la respuesta.')) speakVoiceResponse(assistantMessage.content);
      else setTimeout(startVoiceRecognition, 500);
    }
  }
}
function autoResize() { const input = $('#prompt'); input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; }
function voiceStatus(message, visible = true) {
  const status = $('#voiceStatus');
  status.textContent = message;
  status.classList.toggle('hidden', !visible);
}
function stopVoiceMode(message = 'Conversación por voz detenida.') {
  voiceModeEnabled = false;
  try { voiceRecognition?.stop(); } catch {}
  voiceRecognition = null;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  $('#voiceButton').classList.remove('active');
  $('#voiceButton').setAttribute('aria-pressed', 'false');
  voiceStatus(message, Boolean(message));
}
function localSpanishVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.localService && /^es[-_](MX|US|419)/i.test(voice.lang))
    || voices.find((voice) => voice.localService && /^es/i.test(voice.lang))
    || null;
}
function startVoiceRecognition() {
  if (!voiceModeEnabled || voiceRecognition) return;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { stopVoiceMode('Este navegador no ofrece reconocimiento de voz sin conexión. Usa el dictado del sistema; Nexo no enviará tu audio.'); return; }
  let recognition;
  try { recognition = new Recognition(); }
  catch { stopVoiceMode('No pude abrir el reconocimiento de voz local en este navegador.'); return; }
  if (!('processLocally' in recognition)) { stopVoiceMode('El reconocimiento sin conexión no está disponible en este navegador. Usa el dictado del sistema del teclado.'); return; }
  recognition.processLocally = true;
  recognition.lang = 'es-MX';
  recognition.interimResults = true;
  recognition.continuous = false;
  voiceTranscript = '';
  voiceRecognition = recognition;
  recognition.onstart = () => voiceStatus('Escuchando en el equipo… habla cuando quieras.', true);
  recognition.onresult = (event) => {
    voiceTranscript = [...event.results].map((result) => result[0]?.transcript || '').join(' ').trim();
    if (voiceTranscript) { $('#prompt').value = voiceTranscript; autoResize(); }
  };
  recognition.onerror = (event) => {
    const message = event.error === 'not-allowed'
      ? 'No se concedió permiso para usar el micrófono.'
      : event.error === 'language-not-supported'
        ? 'Falta instalar el paquete local de español para reconocimiento de voz en el navegador.'
        : `El reconocimiento local no pudo iniciar (${event.error || 'error'}).`;
    stopVoiceMode(message);
  };
  recognition.onend = () => {
    voiceRecognition = null;
    const transcript = voiceTranscript.trim();
    if (!voiceModeEnabled) return;
    if (transcript) {
      $('#prompt').value = '';
      voiceStatus('Procesando tu mensaje con el modelo local…', true);
      sendMessage(transcript);
    } else setTimeout(startVoiceRecognition, 450);
  };
  try { recognition.start(); }
  catch { voiceRecognition = null; stopVoiceMode('No pude iniciar el micrófono. Comprueba sus permisos e inténtalo de nuevo.'); }
}
function speakVoiceResponse(text) {
  const speech = window.speechSynthesis;
  const voice = localSpanishVoice();
  if (!speech || !voice) {
    voiceStatus('No hay una voz española instalada localmente. Instala una voz de español en los ajustes del sistema.', true);
    setTimeout(startVoiceRecognition, 1200);
    return;
  }
  speech.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 8_000));
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.onstart = () => voiceStatus(`Nexo responde con la voz local ${voice.name}…`, true);
  utterance.onend = () => { if (voiceModeEnabled) setTimeout(startVoiceRecognition, 450); };
  utterance.onerror = () => { if (voiceModeEnabled) setTimeout(startVoiceRecognition, 450); };
  speech.speak(utterance);
}
$('#voiceButton').addEventListener('click', () => {
  if (voiceModeEnabled) { stopVoiceMode(); return; }
  if (!localSpanishVoice()) { voiceStatus('Instala primero una voz de español sin conexión en el sistema. El audio no saldrá del equipo.', true); return; }
  voiceModeEnabled = true;
  $('#voiceButton').classList.add('active');
  $('#voiceButton').setAttribute('aria-pressed', 'true');
  startVoiceRecognition();
});
function renderFileTray() {
  const tray = $('#fileTray'); tray.replaceChildren(); tray.classList.toggle('hidden', pendingDocuments.length === 0);
  pendingDocuments.forEach((document, index) => {
    const chip = document.createElement('span'); chip.className = 'file-chip';
    if (document.type === 'image') { const preview = document.createElement('img'); preview.src = `data:${document.mime};base64,${document.data}`; preview.alt = ''; chip.append(preview); }
    const name = document.createElement('span'); name.textContent = document.name; chip.append(name);
    const remove = document.createElement('button'); remove.type = 'button'; remove.setAttribute('aria-label', `Quitar ${document.name}`); remove.textContent = '×'; chip.append(remove);
    chip.querySelector('button').addEventListener('click', () => { pendingDocuments.splice(index, 1); renderFileTray(); });
    tray.append(chip);
  });
}
function closeMobileSidebar() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('visible'); }
async function prepareLocalModel() {
  if (!statusSnapshot.connected) return;
  const saved = statusSnapshot.settings?.model || '';
  if (saved && statusSnapshot.models.includes(saved)) return;
  const preferred = Number(statusSnapshot.hardware?.memoryGB) >= 24 ? 'qwen3.5:9b' : 'qwen3.5:4b';
  const available = statusSnapshot.models.find((model) => model.startsWith('qwen3.5:')) || statusSnapshot.models[0];
  if (available) {
    const response = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: statusSnapshot.settings?.endpoint || 'http://127.0.0.1:11434', model: available }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No pude seleccionar el modelo local.');
    await refreshStatus();
    $('#settingsMessage').textContent = `Ollama está listo. Se usará ${available}.`;
    return;
  }
  $('#catalogSelect').value = preferred;
  $('#settingsMessage').textContent = `Ollama está listo. Descargando ${preferred}; ocupa varios GB y puede tardar.`;
  $('#downloadModel').click();
}
async function initializeApp() {
  $('#shortcutHint').textContent = navigator.platform.toLowerCase().includes('mac') ? '⌘ K' : 'Ctrl K';
  await initializeUpdateUI();
  await refreshStatus();
  await syncWorkspaceFromServer();
  render();
  startAutomaticLearning();
  if (!statusSnapshot.connected) {
    $('#settingsDialog').showModal();
    $('#settingsMessage').textContent = 'Sigue los pasos de Ollama aquí. No necesitas cuenta ni claves; el modelo se descarga desde Nexo.';
    return;
  }
  await prepareLocalModel();
}

$('#newChat').addEventListener('click', () => createThread(selectedAgent));
$('#composer').addEventListener('submit', (event) => { event.preventDefault(); sendMessage(); });
$('#stopButton').addEventListener('click', () => activeGeneration?.abort());
$('#prompt').addEventListener('input', autoResize);
$('#attachFile').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', async (event) => {
  const files = [...event.target.files]; let total = pendingDocuments.reduce((sum, document) => sum + (document.text?.length || 0), 0);
  for (const file of files) {
    if (pendingDocuments.length >= 4) break;
    if (file.type.startsWith('image/')) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { alert(`${file.name}: usa JPG, PNG o WebP.`); continue; }
      if (file.size > 5_000_000) { alert(`${file.name} supera el límite de 5 MB.`); continue; }
      if (pendingDocuments.some((document) => document.type === 'image')) { alert('Adjunta una imagen por mensaje en esta versión.'); continue; }
      try { pendingDocuments.push(await compressImage(file)); } catch (error) { alert(error.message); }
      continue;
    }
    if (file.size > 500_000) { alert(`${file.name} supera el límite de 500 KB para este prototipo.`); continue; }
    try {
      let text = await file.text();
      if (/\.html?$/i.test(file.name)) text = new DOMParser().parseFromString(text, 'text/html').body.textContent || '';
      text = text.slice(0, 25_000);
      if (total + text.length > 80_000) { alert('Los documentos adjuntos superan el límite total de 80,000 caracteres.'); break; }
      pendingDocuments.push({ name: file.name, text }); total += text.length;
    } catch { alert(`No pude leer ${file.name}.`); }
  }
  event.target.value = ''; renderFileTray();
});
$('#prompt').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#composer').requestSubmit(); } });
$('#agentPicker').addEventListener('click', () => $('#agentMenu').classList.toggle('hidden'));
$('#openSettings').addEventListener('click', () => { refreshStatus(); $('#settingsDialog').showModal(); });
$('#topSettings').addEventListener('click', () => { refreshStatus(); $('#settingsDialog').showModal(); });
$('#startOllama').addEventListener('click', async () => {
  const button = $('#startOllama'); const status = $('#ollamaSetupStatus');
  button.disabled = true;
  status.textContent = 'Buscando Ollama e intentando iniciarlo…';
  try {
    const result = await window.nexoRuntime?.startOllama();
    if (!result) { status.textContent = 'Abre Ollama desde el menú Inicio y luego vuelve a Nexo para comprobar la conexión.'; return; }
    if (!result.connected) {
      status.textContent = result.installed
        ? 'Encontré Ollama, pero aún no responde. Ábrelo desde el menú Inicio, espera unos segundos y vuelve a pulsar este botón.'
        : 'No encontré Ollama instalado. Descárgalo e instálalo con las opciones predeterminadas; no necesitas iniciar sesión. Después vuelve y pulsa este botón.';
      return;
    }
    await refreshStatus();
    status.textContent = 'Ollama conectado. Preparando el modelo para Nexo…';
    await prepareLocalModel();
  } catch (error) { status.textContent = error.message || 'No pude iniciar Ollama. Ábrelo desde el menú Inicio e inténtalo de nuevo.'; }
  finally { button.disabled = false; }
});
$('#refreshModels').addEventListener('click', async () => {
  const message = $('#settingsMessage'); message.textContent = 'Guardando dirección y buscando modelos…';
  try {
    const response = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: $('#endpointInput').value, model: $('#modelSelect').value }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    await refreshStatus(); message.textContent = statusSnapshot.connected ? 'Motor local conectado.' : 'No se encontró el motor local en esa dirección.';
  } catch (error) { message.textContent = error.message; }
});
$('#saveSettings').addEventListener('click', async () => {
  const message = $('#settingsMessage'); message.textContent = 'Guardando…';
  try {
    const response = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: $('#endpointInput').value, model: $('#modelSelect').value }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    await refreshStatus(); message.textContent = statusSnapshot.connected ? 'Conectado. Tus chats se procesan en ese equipo.' : 'Ajustes guardados; aún no hay motor disponible en la dirección indicada.';
  } catch (error) { message.textContent = error.message; }
});
$('#copyDeviceLink').addEventListener('click', async () => {
  const value = $('#copyDeviceLink').dataset.url;
  if (!value) return;
  try { await navigator.clipboard.writeText(value); $('#copyDeviceLink').textContent = 'Enlace copiado'; }
  catch { $('#copyDeviceLink').textContent = value; }
  setTimeout(() => { $('#copyDeviceLink').textContent = 'Copiar enlace'; }, 2300);
});
$('#saveUpdateRepository').addEventListener('click', async () => {
  const result = await window.nexoUpdate?.configure($('#updateRepository').value.trim());
  showUpdateStatus({ state: result?.ok ? 'configured' : 'error', message: result?.message || (result?.ok ? 'Repositorio guardado.' : 'No se pudo guardar el repositorio.') });
  if (result?.ok) await window.nexoUpdate.check();
});
$('#checkUpdates').addEventListener('click', async () => {
  const result = await window.nexoUpdate?.check();
  if (result && !result.ok) showUpdateStatus({ state: 'error', message: result.message });
});
$('#installUpdate').addEventListener('click', () => window.nexoUpdate?.install());
$('#exportFeedback').addEventListener('click', exportFeedback);
$('#exportWorkspace').addEventListener('click', exportWorkspaceBackup);
$('#importWorkspace').addEventListener('click', () => $('#workspaceFile').click());
$('#workspaceFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0]; const status = $('#backupStatus');
  if (!file) return;
  if (!confirm(`¿Importar ${file.name}? Se agregarán sus chats y agentes; los chats que ya existan se conservarán.`)) { event.target.value = ''; return; }
  status.textContent = 'Leyendo respaldo…';
  try {
    const result = await importWorkspaceBackup(file);
    status.textContent = `Importación lista: ${result.imported} chats nuevos; ${result.agents} agentes y ${result.skills} habilidades considerados.`;
  } catch (error) { status.textContent = error.message || 'No se pudo importar el respaldo.'; }
  event.target.value = '';
});
$('#addNode').addEventListener('click', async () => {
  const name = $('#nodeNameInput').value.trim() || 'Equipo de la red';
  const endpoint = $('#nodeEndpointInput').value.trim();
  if (!endpoint) { $('#nodeMessage').textContent = 'Escribe la dirección local del Ollama del otro equipo.'; return; }
  const current = statusSnapshot.settings?.nodes || [];
  if (current.length >= 8) { $('#nodeMessage').textContent = 'El límite es de ocho equipos.'; return; }
  if (await saveNodes([...current, { id: makeId(), name, endpoint, model: '', context: 8192 }])) {
    $('#nodeNameInput').value = ''; $('#nodeEndpointInput').value = '';
  }
});
document.querySelectorAll('[data-copy-command]').forEach((button) => button.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(button.dataset.copyCommand); button.textContent = 'Copiado'; }
  catch { button.textContent = 'Copia el comando manualmente'; }
  setTimeout(() => { button.textContent = 'Copiar'; }, 1800);
}));
$('#learningEnabled').addEventListener('change', () => { store.learnEnabled = $('#learningEnabled').checked; persist(); });
$('#autoWebLearning').addEventListener('change', () => { ownerWebLearningEnabled = $('#autoWebLearning').checked; persist(); if (ownerWebLearningEnabled) { lastAutoLearningCheck = 0; runAutomaticLearning(); } else $('#autoLearningStatus').textContent = 'La investigación automática está pausada.'; });
$('#saveMemory').addEventListener('click', () => {
  const input = $('#memoryInput'); const text = input.value.trim().replace(/\s+/g, ' ');
  if (!text) return;
  if (!store.memory.some((item) => item.text.toLocaleLowerCase('es-MX') === text.toLocaleLowerCase('es-MX'))) store.memory.unshift({ id: makeId(), text: text.slice(0, 240), created: Date.now() });
  store.memory = store.memory.slice(0, 30); input.value = ''; persist(); renderMemoryPanel();
});
$('#learnSkill').addEventListener('click', async () => {
  const goal = $('#skillGoal').value.trim(); const button = $('#learnSkill'); const status = $('#skillStatus');
  if (goal.length < 5) { status.textContent = 'Describe la habilidad con un poco más de detalle.'; return; }
  button.disabled = true; status.textContent = 'Buscando referencias y preparando un borrador con el modelo local…';
  try {
    const styleLearning = /hablarme|hablar contigo|mi estilo|mi forma de responder|cómo responderme|como responderme/i.test(goal);
    const personalExamples = styleLearning ? getRatedExamples().slice(0, 8) : [];
    const payload = { goal, ...(styleLearning ? { preferences: store.memory.map((item) => item.text), examples: personalExamples } : {}) };
    status.textContent = styleLearning ? 'Comparando tus preferencias y respuestas marcadas en este dispositivo…' : 'Buscando referencias y preparando un borrador con el modelo local…';
    const response = await fetch('/api/skills/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No pude preparar la habilidad.');
    store.skills = [result.skill, ...store.skills.filter((skill) => skill.id !== result.skill.id)].slice(0, 100);
    persist(); renderSkills(); $('#skillGoal').value = '';
    status.textContent = result.warning || `Borrador “${result.skill.name}” guardado. Revisa sus fuentes y actívalo cuando confíes en sus instrucciones.`;
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
$('#copyOwnerCode').addEventListener('click', async () => {
  const code = statusSnapshot.ownerPairCode;
  if (!code) return;
  try { await navigator.clipboard.writeText(code); $('#copyOwnerCode').textContent = 'Copiado'; } catch { $('#copyOwnerCode').textContent = code; }
  setTimeout(() => { $('#copyOwnerCode').textContent = 'Copiar código'; }, 2000);
});
$('#ownerUnlock').addEventListener('click', async () => {
  const status = $('#ownerAccessMessage');
  try {
    const response = await fetch('/api/owner/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: $('#ownerCodeInput').value.trim() }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo desbloquear.');
    $('#ownerCodeInput').value = ''; await refreshStatus(); status.textContent = 'Propietario autorizado en este dispositivo.';
  } catch (error) { status.textContent = error.message; }
});
$('#ownerLock').addEventListener('click', async () => { await fetch('/api/owner/lock', { method: 'POST' }).catch(() => {}); await refreshStatus(); });
$('#clearMemory').addEventListener('click', () => { store.memory = []; persist(); renderMemoryPanel(); });
$('#downloadModel').addEventListener('click', async () => {
  const button = $('#downloadModel'); const model = $('#catalogSelect').value;
  const progress = $('#downloadProgress'); const text = $('#progressText'); const percent = $('#progressPercent'); const bar = $('#progressBar');
  progress.classList.remove('hidden'); button.disabled = true; $('#cancelModelPull').classList.remove('hidden'); text.textContent = 'Conectando con el motor local…'; percent.textContent = ''; bar.style.width = '0%';
  activeModelPull = new AbortController();
  try {
    const save = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: $('#endpointInput').value, model: $('#modelSelect').value }) });
    const saved = await save.json(); if (!save.ok) throw new Error(saved.error || 'No se pudo guardar el motor local.');
    const response = await fetch('/api/models/pull', { method: 'POST', signal: activeModelPull.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
    if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'No se pudo iniciar la descarga.'); }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let finished = false;
    while (true) {
      const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'progress') {
          text.textContent = event.status || 'Descargando…';
          if (event.total && event.completed) { const value = Math.min(100, Math.round(event.completed / event.total * 100)); bar.style.width = `${value}%`; percent.textContent = `${value}%`; }
        }
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'done') { finished = true; text.textContent = 'Modelo listo. Ya puedes usarlo.'; bar.style.width = '100%'; percent.textContent = '100%'; }
      }
      if (done) break;
    }
    if (!finished) throw new Error('La descarga se interrumpió.');
    await refreshStatus(); $('#modelSelect').value = model;
    const configResponse = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: $('#endpointInput').value, model }) });
    if (!configResponse.ok) { const configError = await configResponse.json(); throw new Error(configError.error || 'No se pudo seleccionar el modelo.'); }
    await refreshStatus(); $('#settingsMessage').textContent = 'Modelo instalado y seleccionado.';
  } catch (error) { text.textContent = error.name === 'AbortError' ? 'Descarga detenida.' : error.message; percent.textContent = ''; }
  finally { button.disabled = !statusSnapshot.connected; $('#cancelModelPull').classList.add('hidden'); activeModelPull = null; }
});
$('#cancelModelPull').addEventListener('click', () => activeModelPull?.abort());
$('#clearChats').addEventListener('click', async () => { if (confirm('¿Borrar todas las conversaciones sincronizadas en este equipo?')) { store.threads = []; store.activeId = null; persist(); render(); try { await fetch('/api/workspace/clear', { method: 'POST' }); } catch {} } });
$('#chatSearch').addEventListener('input', renderList);
$('#createAgent').addEventListener('click', () => { $('#agentNameInput').value = ''; $('#agentPromptInput').value = ''; $('#agentDialog').showModal(); });
$('#saveAgent').addEventListener('click', () => {
  const name = $('#agentNameInput').value.trim(); const instruction = $('#agentPromptInput').value.trim();
  if (!name || !instruction) return;
  const agent = { id: `custom-${makeId()}`, name, emoji: '✳', color: 'violet', description: instruction.slice(0, 100), instruction, custom: true };
  store.agents.push(agent); persist(); $('#agentDialog').close(); render();
});
$('#openSidebar').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#scrim').classList.add('visible'); });
$('#closeSidebar').addEventListener('click', closeMobileSidebar); $('#scrim').addEventListener('click', closeMobileSidebar);
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => { setView(button.dataset.view); closeMobileSidebar(); }));
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => { $('#prompt').value = button.dataset.prompt; autoResize(); $('#prompt').focus(); }));
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); createThread(); } });

initializeApp();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
