import { connectLive, escapeHtml } from '/shared/live-client.js';
import { themeSelect, withTheme, previewOf, overlayBase } from './temas.js';

const $ = (id) => document.getElementById(id);
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
  return data;
};
function formMsg(text, kind = '') { $('form-msg').className = `msg ${kind}`; $('form-msg').textContent = text; }

const WHO = [
  ['todos', 'Todo mundo'],
  ['seguidor', 'Seguidores'],
  ['amigo', 'Amigos (seguem um ao outro)'],
  ['fa', 'Fã-clube (Heart Me)'],
  ['assinante', 'Assinantes'],
  ['moderador', 'Moderadores'],
  ['presente', 'Quem mandou presente nesta live'],
];
for (const box of document.querySelectorAll('[data-who]')) {
  box.innerHTML = WHO.map(([v, l]) => `<label><input type="checkbox" value="${v}"> ${l}</label>`).join('');
}
const getWho = (key) => [...document.querySelectorAll(`[data-who="${key}"] input:checked`)].map((i) => i.value);
function setWho(key, list) {
  for (const i of document.querySelectorAll(`[data-who="${key}"] input`)) i.checked = list.includes(i.value);
}
// "Todo mundo" e os grupos não fazem sentido juntos: marcar um desmarca o outro.
document.addEventListener('change', (e) => {
  const box = e.target.closest('[data-who]');
  if (!box) return;
  const inputs = [...box.querySelectorAll('input')];
  if (e.target.value === 'todos' && e.target.checked) inputs.forEach((i) => { if (i.value !== 'todos') i.checked = false; });
  else if (e.target.checked) inputs.find((i) => i.value === 'todos').checked = false;
  if (!inputs.some((i) => i.checked)) inputs.find((i) => i.value === 'todos').checked = true;
  sync();
});

let cfg = {};

function sync() {
  const cmd = $('command').value.trim() || '!musica';
  $('command-hint').innerHTML = `No chat: <code>${escapeHtml(cmd)} nome da música</code> ou <code>${escapeHtml(cmd)} artista - música</code>. Link do Spotify também funciona. Entra na fila, sem cortar a que está tocando.`;
  const skip = $('skip-command').value.trim() || '!pular';
  const votes = Number($('skip-votes').value) || 1;
  $('skip-hint').innerHTML = votes <= 1
    ? `<code>${escapeHtml(skip)}</code> pula na hora.`
    : `Quando ${votes} pessoas diferentes mandarem <code>${escapeHtml(skip)}</code>, a música pula. Os votos zeram a cada música.`;
  document.querySelector('.mincoins').hidden = !getWho('who').includes('presente');
  document.querySelectorAll('.skip-box .grid3, .skip-box .seg, .skip-box > .check, .skip-box > .label, #skip-hint')
    .forEach((el) => { el.style.opacity = $('skip-enabled').checked ? '' : '.45'; });
}

function fill(c) {
  cfg = c;
  $('enabled').checked = c.enabled;
  $('command').value = c.command;
  setWho('who', c.who);
  $('min-coins').value = c.minCoins;
  $('cooldown').value = c.cooldown;
  $('max-per-user').value = c.maxPerUser;
  $('max-queue').value = c.maxQueue;
  $('max-minutes').value = c.maxMinutes;
  document.querySelector(`input[name="play-mode"][value="${c.playMode}"]`).checked = true;
  $('block-explicit').checked = c.blockExplicit;
  $('blocked-words').value = c.blockedWords;
  $('ignored-users').value = c.ignoredUsers;
  $('skip-enabled').checked = c.skipEnabled;
  $('skip-command').value = c.skipCommand;
  $('skip-votes').value = c.skipVotes;
  setWho('skipWho', c.skipWho);
  $('mods-skip').checked = c.modsSkip;
  $('only-requested').checked = c.onlyRequestedSkip;
  if (!$('client-id').value) $('client-id').value = c.clientId || '';
  sync();
}

function collect() {
  return {
    enabled: $('enabled').checked,
    command: $('command').value,
    who: getWho('who'),
    minCoins: Number($('min-coins').value),
    cooldown: Number($('cooldown').value),
    maxPerUser: Number($('max-per-user').value),
    maxQueue: Number($('max-queue').value),
    maxMinutes: Number($('max-minutes').value),
    playMode: document.querySelector('input[name="play-mode"]:checked')?.value,
    blockExplicit: $('block-explicit').checked,
    blockedWords: $('blocked-words').value,
    ignoredUsers: $('ignored-users').value,
    skipEnabled: $('skip-enabled').checked,
    skipCommand: $('skip-command').value,
    skipVotes: Number($('skip-votes').value),
    skipWho: getWho('skipWho'),
    modsSkip: $('mods-skip').checked,
    onlyRequestedSkip: $('only-requested').checked,
  };
}

async function save(msg = 'Salvo.') {
  try {
    const { config } = await api('/api/spotify', { method: 'PUT', body: JSON.stringify(collect()) });
    fill(config);
    formMsg(msg, 'ok');
    toast(msg);
  } catch (err) { formMsg(err.message, 'err'); }
}

$('form').addEventListener('input', sync);
$('form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
$('enabled').addEventListener('change', () => save($('enabled').checked ? 'Pedidos ligados.' : 'Pedidos desligados.'));
$('skip-enabled').addEventListener('change', sync);

// ---------- conexão ----------
$('f-client').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { clientId } = await api('/api/spotify/client', { method: 'POST', body: JSON.stringify({ clientId: $('client-id').value }) });
  $('client-id').value = clientId;
  toast(clientId ? 'Client ID salvo. Agora clique em "Conectar Spotify".' : 'Client ID apagado.');
});
$('login').addEventListener('click', (e) => {
  if (!$('client-id').value.trim()) { e.preventDefault(); toast('Cole e salve o Client ID primeiro (passo 4).', 'err'); }
});
$('logout').addEventListener('click', async () => {
  if (!(await ask('Desconectar o Spotify? Os pedidos pelo chat param até você conectar de novo.', { ok: 'Desconectar', danger: true }))) return;
  await api('/api/spotify/sair', { method: 'POST' });
});

// ---------- estado ----------
function render(m) {
  if (!m) return;
  $('conn-on').hidden = !m.connected;
  $('conn-off').hidden = m.connected;
  if (m.connected) {
    $('acc-name').textContent = m.account ? `Conectado como ${m.account.name}` : 'Conectado';
    $('acc-plan').textContent = m.account ? (m.account.premium ? 'Spotify Premium' : 'Conta sem Premium: pedir e pular não vão funcionar') : '';
  }
  const err = m.needsReconnect
    ? 'O login precisa ser refeito pra liberar os pedidos: clique em Desconectar e depois em Conectar Spotify.'
    : m.error;
  $('sp-error').hidden = !err;
  $('sp-error').textContent = err ? `⚠ ${err}` : '';

  const n = m.now;
  $('np-capa').style.backgroundImage = n?.image ? `url("${n.image}")` : '';
  $('np-nome').textContent = n ? n.name : 'Nada tocando';
  $('np-artista').textContent = n ? n.artists : (m.connected ? 'Abra o Spotify no PC e dê play.' : 'Conecte o Spotify acima.');
  $('np-pedido').textContent = n?.requestedBy ? `🎵 pedido por ${n.requestedBy.nickname || n.requestedBy.username}` : '';
  const btn = $('btn-pausa');
  btn.dataset.ctrl = n?.isPlaying ? 'pausar' : 'tocar';
  btn.textContent = n?.isPlaying ? '⏸' : '▶';
  btn.title = n?.isPlaying ? 'Pausar' : 'Tocar';
  $('np-votos').textContent = m.votes?.count ? `Votos pra pular: ${m.votes.count}/${m.votes.needed}` : '';

  const q = m.pending || [];
  $('queue').innerHTML = q.length
    ? q.map((p, i) => `<li>${i + 1}. ${p.image ? `<img src="${escapeHtml(p.image)}" alt="">` : ''}<span class="track">${escapeHtml(p.name)}</span> · ${escapeHtml(p.artists)} ${p.user ? `<b>(${escapeHtml(p.user.nickname || p.user.username)})</b>` : '<b>(painel)</b>'}</li>`).join('')
    : '<li class="empty-msg">Nenhum pedido esperando.</li>';
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-ctrl]');
  if (!b) return;
  try { await api(`/api/spotify/${b.dataset.ctrl}`, { method: 'POST' }); } catch (err) { toast(err.message, 'err'); }
});
$('clear').addEventListener('click', () => api('/api/spotify/limpar-pedidos', { method: 'POST' }));
$('test').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/api/spotify/pedir', { method: 'POST', body: JSON.stringify({ text: $('test-text').value }) });
    if (r.ok) { toast(`Na fila: ${r.track.name}`); $('test-text').value = ''; } else toast(r.reason, 'err');
  } catch (err) { toast(err.message, 'err'); }
});

// ---------- link e prévia ----------
let base = '';
function setLink(theme) {
  const link = withTheme(base, theme);
  $('link').value = link;
  $('preview').src = previewOf(link);
}
$('theme-slot').innerHTML = themeSelect('');
$('theme-slot').addEventListener('change', (e) => setLink(e.target.value));
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const input = b.parentElement.querySelector('input');
  try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
  b.textContent = 'Copiado!'; setTimeout(() => (b.textContent = 'Copiar'), 1500);
});

// ---------- log ----------
function addLog(l) {
  const ul = $('log');
  ul.querySelector('.empty-msg')?.remove();
  const li = document.createElement('li');
  li.className = l.ok ? '' : 'skip';
  const time = new Date(l.at || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const who = l.user ? `<b>${escapeHtml(l.user.nickname || l.user.username)}</b>` : '<b>Painel</b>';
  const what = l.skip ? 'pular' : (l.track ? `<span class="track">${escapeHtml(l.track.name)}</span> · ${escapeHtml(l.track.artists)}` : `"${escapeHtml(l.query)}"`);
  const icon = l.skip ? '⏭' : (l.ok ? '🎵' : '🚫');
  li.innerHTML = `<time>${time}</time>${icon} ${who}: ${what}${l.reason ? ` <span class="why">(${escapeHtml(l.reason)})</span>` : ''}`;
  ul.prepend(li);
  while (ul.children.length > 60) ul.lastChild.remove();
}

// ---------- carregar ----------
const info = await api('/api/status');
base = `${overlayBase(info.port)}/overlay/musica`;
setLink('');
const data = await api('/api/spotify');
$('redirect').value = data.redirectUri;
fill(data.config);
render(data);
(data.history || []).forEach(addLog);
if (new URLSearchParams(location.search).get('spotify') === 'ok') toast('Spotify conectado!');

connectLive({
  onHello: ({ music }) => render(music),
  onMusic: render,
  onMusicLog: addLog,
});
