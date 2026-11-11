import { connectLive, escapeHtml, initials, describe, formatNumber } from '/shared/live-client.js';

const $ = (id) => document.getElementById(id);
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
  return data;
};

let cfg = {};
let status = { state: 'desconectado' };

// ---------- conexão: o @ fica salvo até você trocar ----------
function renderWho() {
  const user = cfg.username || '';
  $('who-name').textContent = user ? `@${user}` : 'Nenhum @ salvo';
  $('who-initial').textContent = user ? initials(user) : '@';
  const editing = !$('connect-form').hidden;
  $('who-actions').hidden = editing || !user;
  if (!user && !editing) openEditor();
  const s = status.state;
  const on = s === 'conectado' || s === 'conectando' || s === 'aguardando';
  $('btn-connect').hidden = on;
  $('btn-disconnect').hidden = !on;
  $('btn-connect').textContent = s === 'erro' ? 'Tentar de novo' : 'Conectar';
  const detail = {
    conectado: `Ao vivo agora. ${status.message || ''}`,
    conectando: 'Conectando na live…',
    aguardando: status.message || 'Esperando a live começar…',
    erro: status.message || 'Não deu pra conectar.',
    desconectado: user ? (status.message && status.message !== 'Desconectado.' ? status.message : 'Pronto pra conectar.') : 'Digite o seu @ pra começar.',
  }[s] || '';
  $('status-detail').textContent = detail;
}

function openEditor() {
  $('connect-form').hidden = false;
  $('who-actions').hidden = true;
  $('btn-cancel-change').hidden = !cfg.username;
  $('username').value = cfg.username || '';
  $('username').focus();
}
function closeEditor() { $('connect-form').hidden = true; renderWho(); }

async function connect() {
  await api('/api/connect', { method: 'POST', body: JSON.stringify({ username: cfg.username }) }).catch((err) => toast(err.message, 'err'));
}

$('btn-change').addEventListener('click', openEditor);
$('btn-cancel-change').addEventListener('click', closeEditor);
$('btn-connect').addEventListener('click', connect);
$('btn-disconnect').addEventListener('click', () => api('/api/disconnect', { method: 'POST' }));
$('connect-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('username').value.replace(/^@/, '').trim();
  if (!username) return;
  cfg = await api('/api/config', { method: 'PUT', body: JSON.stringify({ username }) });
  closeEditor();
  toast(`@${username} salvo. Conectando…`);
  connect();
});
for (const id of ['auto-connect', 'auto-retry']) {
  $(id).addEventListener('change', async () => {
    cfg = await api('/api/config', { method: 'PUT', body: JSON.stringify({ autoConnect: $('auto-connect').checked, autoRetry: $('auto-retry').checked }) });
    toast('Preferência salva.');
  });
}

// ---------- números ----------
const shown = {};
function setStat(id, value) {
  const el = $(id);
  const to = Number(value) || 0;
  const from = shown[id] ?? 0;
  if (from === to) { el.textContent = formatNumber(to); return; }
  shown[id] = to;
  if (to > from && from > 0) { const card = el.parentElement; card.classList.remove('bump'); void card.offsetWidth; card.classList.add('bump'); }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 500);
    el.textContent = formatNumber(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderStatus(s) {
  if (!s) return;
  status = s;
  setStat('st-viewers', s.state === 'conectado' ? s.viewers : 0);
  renderWho();
}

// ---------- feed ----------
const filters = new Set(['chat', 'gift', 'follow', 'share']);
const recentEvents = [];
function addToFeed(ev, store = true) {
  if (ev.streaking) return;
  if (store) { recentEvents.push(ev); if (recentEvents.length > 300) recentEvents.shift(); }
  if (!filters.has(ev.type)) return;
  const feed = $('feed');
  feed.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  li.className = `ev ${ev.type}`;
  const avatar = ev.user?.avatar
    ? `<img class="avatar" src="${escapeHtml(ev.user.avatar)}" alt="" loading="lazy">`
    : `<span class="avatar">${escapeHtml(initials(ev.user?.nickname))}</span>`;
  const time = new Date(ev.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  li.innerHTML = `${avatar}
    <div class="body"><b>${escapeHtml(ev.user?.nickname)}</b> <span class="user">@${escapeHtml(ev.user?.username)}</span>
    <div>${escapeHtml(describe(ev))}${ev.simulated ? ' <span class="tag">teste</span>' : ''}</div></div>
    <time>${time}</time>`;
  feed.prepend(li);
  while (feed.children.length > 150) feed.lastChild.remove();
}
function redrawFeed() {
  $('feed').innerHTML = '<li class="empty">Nenhum evento ainda.</li>';
  recentEvents.forEach((ev) => addToFeed(ev, false));
}
$('feed-filters').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  b.classList.toggle('on');
  if (b.classList.contains('on')) filters.add(b.dataset.f); else filters.delete(b.dataset.f);
  redrawFeed();
});
$('btn-clear-feed').addEventListener('click', () => { recentEvents.length = 0; redrawFeed(); });

// ---------- rankings ----------
const rankList = (rows) => rows.length
  ? rows.slice(0, 10).map((u) => `<li><span title="@${escapeHtml(u.username)}">${escapeHtml(u.nickname)}</span><b>${formatNumber(u.value)}</b></li>`).join('')
  : '<li class="vazio">Ninguém ainda.</li>';

function renderRankings(r) {
  if (!r) return;
  const t = r.totals || {};
  setStat('st-likes', t.likes);
  setStat('st-coins', t.coins);
  setStat('st-follows', t.follows);
  setStat('st-shares', t.shares);
  setStat('st-gifts', t.gifts);
  setStat('st-peak', t.peakViewers);
  $('rank-likes').innerHTML = rankList(r.likes);
  $('rank-coins').innerHTML = rankList(r.coins);
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthName = (key) => { const [y, m] = key.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; };

function renderMonthly(r) {
  if (!r) return;
  $('month-label').textContent = monthName(r.month);
  $('month-likes').innerHTML = rankList(r.likes);
  $('month-coins').innerHTML = rankList(r.coins);
}

async function loadMonthlyExtras() {
  const m = await api('/api/mensal');
  renderMonthly(m);
  $('month-who').innerHTML = m.myUsername
    ? `Conta só as lives de <b>@${escapeHtml(m.myUsername)}</b> e zera todo dia 1º. Dá pra trocar em <a href="/painel/config.html">Configurações</a>.`
    : 'Ainda sem o seu @: ele é preenchido na primeira vez que você conecta.';
  $('month-history').innerHTML = m.history.length
    ? m.history.map((h) => `<div class="mes"><b>${monthName(h.month)} <span class="tag">${escapeHtml(h.label)}</span></b>
        <div class="rankings"><ol class="rank">${rankList(h.likes)}</ol><ol class="rank">${rankList(h.coins)}</ol></div></div>`).join('')
    : '<p class="hint">Nenhum mês fechado ainda.</p>';
}

$('btn-reset-month').addEventListener('click', async () => {
  if (!(await ask('Zerar o ranking do mês? O que tem agora vai pro histórico.', { ok: 'Zerar', danger: true }))) return;
  await api('/api/mensal/reset', { method: 'POST' });
  await loadMonthlyExtras();
  toast('Ranking do mês zerado.');
});
$('btn-reset').addEventListener('click', async () => {
  if (!(await ask('Zerar os rankings de likes e coins desta live?', { ok: 'Zerar', danger: true }))) return;
  await api('/api/rankings/reset', { method: 'POST' });
  toast('Rankings da live zerados.');
});

// ---------- testes ----------
document.addEventListener('click', (e) => {
  const test = e.target.closest('[data-test]');
  if (test) fetch(`/api/test/${test.dataset.test}`, { method: 'POST' });
});
$('test-comment').addEventListener('submit', (e) => {
  e.preventDefault();
  const comment = $('test-comment-text').value.trim();
  if (!comment) return;
  fetch('/api/test/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) });
  $('test-comment-text').value = '';
});

// ---------- carregar ----------
cfg = await api('/api/config');
$('auto-connect').checked = cfg.autoConnect;
$('auto-retry').checked = cfg.autoRetry;
const info = await api('/api/status');
renderStatus(info.status);
loadMonthlyExtras();

connectLive({
  onHello: ({ status: s, recent, rankings, monthly }) => {
    renderStatus(s); renderRankings(rankings); renderMonthly(monthly);
    recentEvents.length = 0; recent.forEach((ev) => recentEvents.push(ev)); redrawFeed();
  },
  onEvent: addToFeed,
  onStatus: renderStatus,
  onRankings: renderRankings,
  onMonthly: renderMonthly,
});
