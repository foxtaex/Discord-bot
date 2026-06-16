const state = {
  session: null,
  config: null,
  factions: [],
  webKeys: [],
  apiKeys: [],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener('DOMContentLoaded', bootstrap);

async function bootstrap() {
  bindEvents();
  try {
    const data = await api('/session');
    state.session = data.session;
    await openApp();
  } catch {
    showLogin();
  }
}

function bindEvents() {
  $('#login-form').addEventListener('submit', login);
  $('#logout').addEventListener('click', logout);
  $$('.nav-item').forEach((button) =>
    button.addEventListener('click', () => switchView(button.dataset.view)),
  );
  $('#settings-form').addEventListener('submit', saveSettings);
  $('#add-category').addEventListener('click', () => addCategoryRow());
  $('#save-categories').addEventListener('click', saveCategories);
  $('#add-faction').addEventListener('click', () => openFactionEditor());
  $('#add-webkey').addEventListener('click', openWebKeyEditor);
  $('#add-api-key').addEventListener('click', openApiKeyEditor);
  $('#refresh-logs').addEventListener('click', loadLogs);
}

async function login(event) {
  event.preventDefault();
  $('#login-error').textContent = '';
  try {
    const response = await fetch('/panel/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: $('#access-key').value.trim() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Anmeldung fehlgeschlagen.');
    state.session = data.session;
    $('#access-key').value = '';
    await openApp();
  } catch (error) {
    $('#login-error').textContent = error.message;
  }
}

async function logout() {
  await api('/logout', { method: 'POST' }).catch(() => null);
  state.session = null;
  showLogin();
}

async function openApp() {
  $('#login-view').hidden = true;
  $('#app-shell').hidden = false;
  $('#session-badge').textContent = `${state.session.permissionLevel} · ${remaining(
    state.session.expiresAt,
  )}`;
  $('#add-faction').hidden = !hasPermission('factions:write');
  $('#save-categories').hidden = !hasPermission('config:write');
  $('#add-category').hidden = !hasPermission('config:write');
  $('#settings-form button[type="submit"]').hidden =
    !hasPermission('config:write');
  await loadDashboard();
}

function showLogin() {
  $('#app-shell').hidden = true;
  $('#login-view').hidden = false;
}

async function switchView(view) {
  $$('.nav-item').forEach((item) =>
    item.classList.toggle('active', item.dataset.view === view),
  );
  $$('.view').forEach((item) =>
    item.classList.toggle('active', item.id === `view-${view}`),
  );
  $('#page-title').textContent =
    $(`.nav-item[data-view="${view}"]`).textContent;
  if (view === 'dashboard') await loadDashboard();
  if (view === 'settings') await loadSettings();
  if (view === 'factions') await loadFactions();
  if (view === 'keys') await loadKeys();
  if (view === 'logs') await loadLogs();
}

async function loadDashboard() {
  const data = await api('/dashboard');
  const metrics = {
    Server: data.guild.name,
    Mitglieder: data.guild.memberCount,
    Tickets: data.counts.tickets,
    Fraktionen: data.counts.factions,
    'Gateway-Ping': `${data.bot.ping} ms`,
    Laufzeit: duration(data.bot.uptime * 1000),
  };
  $('#status-grid').innerHTML = Object.entries(metrics)
    .map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join('');
  $('#module-grid').innerHTML = Object.entries(data.modules)
    .map(([name, enabled]) => `<div class="module"><strong>${escapeHtml(name)}</strong><span class="${enabled ? 'status-on' : 'status-off'}">${enabled ? 'Aktiv' : 'Inaktiv'}</span></div>`)
    .join('');
}

async function loadSettings() {
  state.config = await api('/config');
  const form = $('#settings-form').elements;
  form.welcomeMessage.value = state.config.welcome.message;
  form.brandColor.value = state.config.branding.color;
  form.welcomeColor.value = state.config.welcome.color;
  form.archiveCategoryId.value = state.config.tickets.archiveCategoryId;
  form.waitingChannelId.value = state.config.voiceSupport.waitingChannelId;
  form.ticketRoles.value = state.config.tickets.supportRoleIds.join(', ');
  form.voiceRoles.value = state.config.voiceSupport.supportRoleIds.join(', ');
  form.welcomeEnabled.checked = state.config.welcome.enabled;
  form.ticketsEnabled.checked = state.config.tickets.enabled;
  form.voiceEnabled.checked = state.config.voiceSupport.enabled;
  form.factionsEnabled.checked = state.config.factions.enabled;
  renderCategories(state.config.tickets.categories);
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget.elements;
  await api('/config', {
    method: 'PATCH',
    body: {
      branding: { color: form.brandColor.value },
      welcome: {
        enabled: form.welcomeEnabled.checked,
        message: form.welcomeMessage.value,
        color: form.welcomeColor.value,
      },
      tickets: {
        enabled: form.ticketsEnabled.checked,
        archiveCategoryId: form.archiveCategoryId.value.trim(),
        supportRoleIds: csv(form.ticketRoles.value),
      },
      voiceSupport: {
        enabled: form.voiceEnabled.checked,
        waitingChannelId: form.waitingChannelId.value.trim(),
        supportRoleIds: csv(form.voiceRoles.value),
      },
      factions: { enabled: form.factionsEnabled.checked },
    },
  });
  toast('Einstellungen gespeichert.');
}

function renderCategories(categories) {
  $('#category-list').innerHTML = '';
  categories.forEach(addCategoryRow);
}

function addCategoryRow(category = {}) {
  const row = document.createElement('div');
  row.className = 'category-row';
  row.innerHTML = `
    <div class="category-header">
      <div>
        <span class="eyebrow">Ticket-Kategorie</span>
        <strong data-category-title>${escapeHtml(category.label || 'Neue Kategorie')}</strong>
      </div>
      <button type="button" class="danger">Entfernen</button>
    </div>
    <div class="category-fields">
      <label>Key
        <input data-field="key" placeholder="z. B. allgemeine-hilfe" value="${escapeAttr(category.key || '')}">
      </label>
      <label>Name
        <input data-field="label" placeholder="Anzeigename der Kategorie" value="${escapeAttr(category.label || '')}">
      </label>
      <label>Beschreibung
        <textarea data-field="description" rows="3" placeholder="Kurze Beschreibung für das Ticket-Menü">${escapeHtml(category.description || '')}</textarea>
      </label>
      <label>Emoji
        <input data-field="emoji" placeholder="z. B. 💬" value="${escapeAttr(category.emoji || '')}">
      </label>
      <label>Discord-Kategorie-ID
        <input data-field="parentCategoryId" inputmode="numeric" placeholder="ID der Discord-Kategorie" value="${escapeAttr(category.parentCategoryId || '')}">
      </label>
      <label>Support-Rollen
        <input data-field="supportRoleIds" placeholder="Rollen-IDs mit Komma trennen" value="${escapeAttr((category.supportRoleIds || []).join(', '))}">
      </label>
    </div>`;
  const labelInput = row.querySelector('[data-field="label"]');
  const title = row.querySelector('[data-category-title]');
  labelInput.addEventListener('input', () => {
    title.textContent = labelInput.value.trim() || 'Neue Kategorie';
  });
  row.querySelector('button').addEventListener('click', () => row.remove());
  $('#category-list').append(row);
}

async function saveCategories() {
  const categories = $$('.category-row').map((row) => ({
    key: row.querySelector('[data-field="key"]').value.trim().toLowerCase(),
    label: row.querySelector('[data-field="label"]').value.trim(),
    description: row.querySelector('[data-field="description"]').value.trim(),
    emoji: row.querySelector('[data-field="emoji"]').value.trim(),
    parentCategoryId: row.querySelector('[data-field="parentCategoryId"]').value.trim(),
    supportRoleIds: csv(
      row.querySelector('[data-field="supportRoleIds"]').value,
    ),
  }));
  await api('/ticket-categories', { method: 'PUT', body: categories });
  toast('Ticket-Kategorien und Panels aktualisiert.');
}

async function loadFactions() {
  const data = await api('/factions');
  state.factions = data.factions;
  $('#faction-list').innerHTML = data.factions.length
    ? data.factions.map(factionCard).join('')
    : '<p class="muted">Noch keine Fraktionen vorhanden.</p>';
  $$('[data-edit-faction]').forEach((button) =>
    button.addEventListener('click', () =>
      openFactionEditor(state.factions.find((item) => item.publicId === button.dataset.editFaction)),
    ),
  );
  $$('[data-delete-faction]').forEach((button) =>
    button.addEventListener('click', () => deleteFaction(button.dataset.deleteFaction)),
  );
}

function factionCard(faction) {
  const actions = hasPermission('factions:write')
    ? `<div class="actions">
      <button data-edit-faction="${faction.publicId}">Bearbeiten</button>
      <button class="danger" data-delete-faction="${faction.publicId}">Löschen</button>
    </div>`
    : '';
  return `<article class="faction-card">
    <h3>${escapeHtml(faction.name)}</h3>
    <span class="pill">${escapeHtml(faction.type)}</span><span class="pill">${escapeHtml(faction.status)}</span>
    <p>${escapeHtml(faction.description || 'Keine Beschreibung')}</p>
    <small class="muted">${faction.members.length} Mitglieder</small>
    ${actions}
  </article>`;
}

function openFactionEditor(faction = null) {
  const form = $('#editor-form');
  form.innerHTML = `
    <h2>${faction ? 'Fraktion bearbeiten' : 'Fraktion erstellen'}</h2>
    <label>Name<input name="name" required value="${escapeAttr(faction?.name || '')}"></label>
    <label>Status<select name="status">${options(['active','inactive','recruiting','closed'], faction?.status)}</select></label>
    <label>Typ<select name="type">${options(['state','legal','illegal','neutral'], faction?.type)}</select></label>
    <label>Leitung-ID<input name="leaderId" value="${escapeAttr(faction?.leaderId || '')}"></label>
    <label>Stellvertretung-ID<input name="deputyId" value="${escapeAttr(faction?.deputyId || '')}"></label>
    <label>Discord-Rollen-ID<input name="discordRoleId" value="${escapeAttr(faction?.discordRoleId || '')}"></label>
    <label>Channel-ID<input name="channelId" value="${escapeAttr(faction?.channelId || '')}"></label>
    <label class="wide">Beschreibung<textarea name="description">${escapeHtml(faction?.description || '')}</textarea></label>
    <label class="wide">Notizen<textarea name="notes">${escapeHtml(faction?.notes || '')}</textarea></label>
    <div class="dialog-actions"><button type="button" class="secondary" data-close>Abbrechen</button><button type="submit">Speichern</button></div>`;
  form.querySelector('[data-close]').addEventListener('click', () => $('#editor-dialog').close());
  form.onsubmit = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    await api(faction ? `/factions/${faction.publicId}` : '/factions', {
      method: faction ? 'PATCH' : 'POST',
      body,
    });
    $('#editor-dialog').close();
    await loadFactions();
    toast('Fraktion gespeichert.');
  };
  $('#editor-dialog').showModal();
}

async function deleteFaction(id) {
  await api(`/factions/${id}`, { method: 'DELETE' });
  await loadFactions();
  toast('Fraktion gelöscht.');
}

async function loadKeys() {
  const webData = await api('/webkeys');
  state.webKeys = webData.keys;
  $('#webkey-list').innerHTML = table(
    ['ID', 'Key', 'Ersteller', 'Stufe', 'Status', 'Restzeit', ''],
    webData.keys.map((key) => [
      key.id,
      key.shortKey,
      key.createdBy,
      key.permissionLevel,
      key.status,
      duration(key.remainingMs),
      key.status === 'active' ? `<button class="danger" data-revoke-webkey="${key.id}">Widerrufen</button>` : '',
    ]),
  );
  $$('[data-revoke-webkey]').forEach((button) =>
    button.addEventListener('click', async () => {
      await api(`/webkeys/${button.dataset.revokeWebkey}`, { method: 'DELETE' });
      await loadKeys();
    }),
  );
  if (!hasPermission('admin:keys')) {
    $('#api-key-list').innerHTML = '<p class="muted">Administratorrechte erforderlich.</p>';
    $('#add-api-key').hidden = true;
    $('#add-webkey').hidden = true;
    return;
  }
  const apiData = await api('/api-keys');
  state.apiKeys = apiData.keys;
  $('#api-key-list').innerHTML = table(
    ['ID', 'Name', 'Key', 'Status', 'Letzte Nutzung', ''],
    apiData.keys.map((key) => [
      key.id,
      escapeHtml(key.name),
      key.shortKey,
      key.revoked ? 'Widerrufen' : 'Aktiv',
      formatDate(key.lastUsedAt),
      key.revoked ? '' : `<button class="danger" data-revoke-api="${key.id}">Widerrufen</button>`,
    ]),
  );
  $$('[data-revoke-api]').forEach((button) =>
    button.addEventListener('click', async () => {
      await api(`/api-keys/${button.dataset.revokeApi}`, { method: 'DELETE' });
      await loadKeys();
    }),
  );
}

function openWebKeyEditor() {
  openSimpleEditor('Webkey erstellen', `
    <label>Stufe<select name="permissionLevel">${options(['viewer','editor','admin'], 'editor')}</select></label>
    <label>Stunden<input name="durationHours" type="number" min="1" max="24" value="2"></label>`,
  async (body) => {
    body.durationHours = Number(body.durationHours);
    const created = await api('/webkeys', { method: 'POST', body });
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(created.accessKey).catch(() => null);
    }
    toast(`Key einmalig: ${created.accessKey}`);
    await loadKeys();
  });
}

function openApiKeyEditor() {
  openSimpleEditor('API-Key erstellen', `
    <label>Name<input name="name" required></label>
    <label class="wide">Berechtigungen<input name="permissions" value="config:read,tickets:read,logs:write"></label>`,
  async (body) => {
    body.permissions = csv(body.permissions);
    const created = await api('/api-keys', { method: 'POST', body });
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(created.apiKey).catch(() => null);
    }
    toast(`API-Key einmalig: ${created.apiKey}`);
    await loadKeys();
  });
}

function openSimpleEditor(title, fields, onSubmit) {
  const form = $('#editor-form');
  form.innerHTML = `<h2>${title}</h2>${fields}<div class="dialog-actions"><button type="button" class="secondary" data-close>Abbrechen</button><button type="submit">Erstellen</button></div>`;
  form.querySelector('[data-close]').addEventListener('click', () => $('#editor-dialog').close());
  form.onsubmit = async (event) => {
    event.preventDefault();
    await onSubmit(Object.fromEntries(new FormData(form)));
    $('#editor-dialog').close();
  };
  $('#editor-dialog').showModal();
}

async function loadLogs() {
  const data = await api('/logs?limit=150');
  $('#log-list').innerHTML = data.logs.length
    ? data.logs.map((log) => `<article class="log-entry"><strong>${escapeHtml(log.source)}</strong> · ${escapeHtml(log.level)}<p>${escapeHtml(log.message)}</p><small>${formatDate(log.createdAt)}</small></article>`).join('')
    : '<p class="muted">Keine Logs vorhanden.</p>';
}

async function api(path, options = {}) {
  const response = await fetch(`/panel/api${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(isMutation(options.method) ? { 'x-csrf-token': cookie('panel_csrf') } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    showLogin();
    throw new Error(data.error?.message || 'Sitzung abgelaufen.');
  }
  if (!response.ok) {
    toast(data.error?.message || 'Aktion fehlgeschlagen.');
    throw new Error(data.error?.message || 'Aktion fehlgeschlagen.');
  }
  return data;
}

function hasPermission(permission) {
  return state.session.permissions.includes('*') || state.session.permissions.includes(permission);
}

function isMutation(method = 'GET') {
  return !['GET', 'HEAD'].includes(method);
}

function cookie(name) {
  return document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') || '';
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((item) => `<td>${item ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function options(values, selected) {
  return values.map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`).join('');
}

function csv(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function remaining(date) {
  return `noch ${duration(Math.max(0, new Date(date).getTime() - Date.now()))}`;
}

function duration(milliseconds) {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  return `${hours} Std. ${minutes % 60} Min.`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('de-DE') : '-';
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, 8000);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
