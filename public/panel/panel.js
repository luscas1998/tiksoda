import { connectLive, escapeHtml, initials, describe } from '/shared/live-client.js';

const $ = (id) => document.getElementById(id);
const STATE_LABEL = {
  desconectado: 'Desconectado',
  conectando: 'Conectando…',
  conectado: 'Ao vivo',
  erro: 'Erro',
};

let sessionLikes = 0;
let sessionCoins = 0;

function renderStatus(s) {
  const el = $('status');
  el.className = `status ${s.state}`;
  $('status-text').textContent = s.state === 'conectado' ? `Ao vivo · @${s.username}` : STATE_LABEL[s.state] || s.state;
  if (s.message) $('status-detail').textContent = s.message;
  $('viewers').textContent = (s.viewers || 0).toLocaleString('pt-BR');
  $('btn-connect').disabled = s.state === 'conectando';
}

function addToFeed(ev) {
  if (ev.streaking) return;
  if (ev.type === 'like') { sessionLikes += ev.likeCount; $('likes').textContent = sessionLikes.toLocaleString('pt-BR'); }
  if (ev.type === 'gift') { sessionCoins += ev.totalCoins; $('coins').textContent = sessionCoins.toLocaleString('pt-BR'); }
  if ((ev.type === 'like' || ev.type === 'member') && !$('show-likes').checked) return;

  const feed = $('feed');
  feed.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  li.className = `ev ${ev.type}`;
  const avatar = ev.user?.avatar
    ? `<img class="avatar" src="${escapeHtml(ev.user.avatar)}" alt="">`
    : `<span class="avatar">${escapeHtml(initials(ev.user?.nickname))}</span>`;
  const time = new Date(ev.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  li.innerHTML = `${avatar}
    <div class="body"><b>${escapeHtml(ev.user?.nickname)}</b> <span class="user">@${escapeHtml(ev.user?.username)}</span>
    <div>${escapeHtml(describe(ev))}${ev.simulated ? ' <span class="tag">teste</span>' : ''}</div></div>
    <time>${time}</time>`;
  feed.prepend(li);
  while (feed.children.length > 200) feed.lastChild.remove();
}

function renderOverlays(list, port) {
  const base = `http://localhost:${port}`;
  $('overlays').innerHTML = list.map((o) => `
    <li class="${o.ready ? '' : 'soon'}">
      <div>
        <b>${escapeHtml(o.name)}</b> ${o.ready ? '' : '<span class="tag">em breve</span>'}
        <p>${escapeHtml(o.description)} <span class="size">Tamanho sugerido: ${escapeHtml(o.size)}</span></p>
      </div>
      ${o.ready ? `<div class="row link-row">
        <input readonly value="${base}/overlay/${o.slug}">
        <button class="secondary" data-copy="${base}/overlay/${o.slug}">Copiar</button>
        <a class="secondary button" href="/overlay/${o.slug}" target="_blank">Abrir</a>
      </div>` : ''}
    </li>`).join('');
}

document.addEventListener('click', async (e) => {
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    try { await navigator.clipboard.writeText(copy.dataset.copy); copy.textContent = 'Copiado!'; }
    catch { copy.previousElementSibling.select(); document.execCommand('copy'); copy.textContent = 'Copiado!'; }
    setTimeout(() => (copy.textContent = 'Copiar'), 1500);
  }
  const test = e.target.closest('[data-test]');
  if (test) fetch(`/api/test/${test.dataset.test}`, { method: 'POST' });
});

$('connect-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  sessionLikes = 0; sessionCoins = 0;
  $('likes').textContent = '0'; $('coins').textContent = '0';
  const res = await fetch('/api/connect', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: $('username').value }),
  });
  if (!res.ok) $('status-detail').textContent = (await res.json()).error;
});

$('btn-disconnect').addEventListener('click', () => fetch('/api/disconnect', { method: 'POST' }));

const info = await (await fetch('/api/status')).json();
if (info.config?.username) $('username').value = info.config.username;
renderOverlays(info.overlays, info.port);
renderStatus(info.status);

connectLive({
  onHello: ({ status, recent }) => { renderStatus(status); $('feed').innerHTML = '<li class="empty">Nenhum evento ainda.</li>'; recent.forEach(addToFeed); },
  onEvent: addToFeed,
  onStatus: renderStatus,
  onSocket: (ok) => { if (!ok) renderStatus({ state: 'erro', message: 'O app foi fechado. Abra o TikSoda de novo.' }); },
});
