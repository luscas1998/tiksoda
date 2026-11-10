import { connectLive, escapeHtml, initials, describe, formatNumber } from '/shared/live-client.js';

const $ = (id) => document.getElementById(id);
const STATE_LABEL = {
  desconectado: 'Desconectado',
  conectando: 'Conectando…',
  conectado: 'Ao vivo',
  erro: 'Erro',
};


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

// Prévia: cada overlay roda num iframe reduzido, recebendo os mesmos
// eventos ao vivo. Editar o link (ex.: ?top=3) atualiza a prévia.
const PREVIEW_MAX_W = 320;
const PREVIEW_MAX_H = 240;

function previewHtml(o) {
  const [w, h] = String(o.size).split('x').map((n) => parseInt(n, 10) || 400);
  const scale = Math.min(PREVIEW_MAX_W / w, PREVIEW_MAX_H / h, 1);
  return `<div class="preview" style="width:${Math.round(w * scale)}px;height:${Math.round(h * scale)}px">
    <iframe src="/overlay/${o.slug}" title="Prévia ${escapeHtml(o.name)}" tabindex="-1"
      style="width:${w}px;height:${h}px;transform:scale(${scale})"></iframe>
  </div>`;
}

function renderOverlays(list, port) {
  const base = `http://localhost:${port}`;
  $('overlays').innerHTML = list.map((o) => `
    <li class="${o.ready ? '' : 'soon'}" data-slug="${o.slug}">
      <div class="ov-info">
        <b>${escapeHtml(o.name)}</b> ${o.ready ? '' : '<span class="tag">em breve</span>'}
        <p>${escapeHtml(o.description)} <span class="size">Tamanho sugerido: ${escapeHtml(o.size)}</span>${o.options && o.ready ? `<span class="size">Opções no link: <code>${escapeHtml(o.options)}</code></span>` : ''}</p>
        ${o.ready ? `<div class="row link-row">
          <input class="ov-link" value="${base}/overlay/${o.slug}" spellcheck="false" title="Dá pra editar: junte opções no fim, ex. ?top=3">
          <button class="secondary" data-copy>Copiar</button>
          <a class="secondary button ov-open" href="/overlay/${o.slug}" target="_blank">Abrir</a>
        </div>` : ''}
      </div>
      ${o.ready ? `<div class="ov-preview"><span class="preview-label">Prévia ao vivo</span>${previewHtml(o)}</div>` : ''}
    </li>`).join('');
}

// Atualiza a prévia e o botão Abrir quando o link é editado.
let linkTimer;
document.addEventListener('input', (e) => {
  const input = e.target.closest('.ov-link');
  if (!input) return;
  clearTimeout(linkTimer);
  linkTimer = setTimeout(() => {
    const li = input.closest('li');
    let path;
    try {
      const u = new URL(input.value);
      if (!u.pathname.startsWith('/overlay/')) return;
      path = u.pathname + u.search;
    } catch { return; }
    li.querySelector('iframe').src = path;
    li.querySelector('.ov-open').href = path;
  }, 400);
});

document.addEventListener('click', async (e) => {
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    const input = copy.parentElement.querySelector('input');
    try { await navigator.clipboard.writeText(input.value); copy.textContent = 'Copiado!'; }
    catch { input.select(); document.execCommand('copy'); copy.textContent = 'Copiado!'; }
    setTimeout(() => (copy.textContent = 'Copiar'), 1500);
  }
  const test = e.target.closest('[data-test]');
  if (test) fetch(`/api/test/${test.dataset.test}`, { method: 'POST' });
});

$('connect-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/connect', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: $('username').value }),
  });
  if (!res.ok) $('status-detail').textContent = (await res.json()).error;
});

function renderRankings(r) {
  if (!r) return;
  $('likes').textContent = (r.totals.likes || 0).toLocaleString('pt-BR');
  $('coins').textContent = (r.totals.coins || 0).toLocaleString('pt-BR');
  for (const kind of ['likes', 'coins']) {
    const rows = r[kind].slice(0, 10);
    $(`rank-${kind}`).innerHTML = rows.length
      ? rows.map((u) => `<li><span title="@${escapeHtml(u.username)}">${escapeHtml(u.nickname)}</span><b>${formatNumber(u.value)}</b></li>`).join('')
      : '<li class="vazio">Ninguém ainda.</li>';
  }
}

$('btn-reset').addEventListener('click', () => {
  if (confirm('Zerar os rankings de likes e coins desta live?')) fetch('/api/rankings/reset', { method: 'POST' });
});

$('btn-disconnect').addEventListener('click', () => fetch('/api/disconnect', { method: 'POST' }));

const info = await (await fetch('/api/status')).json();
if (info.config?.username) $('username').value = info.config.username;
renderOverlays(info.overlays, info.port);
renderStatus(info.status);

connectLive({
  onHello: ({ status, recent, rankings }) => { renderStatus(status); renderRankings(rankings); $('feed').innerHTML = '<li class="empty">Nenhum evento ainda.</li>'; recent.forEach(addToFeed); },
  onEvent: addToFeed,
  onStatus: renderStatus,
  onRankings: renderRankings,
  onSocket: (ok) => { if (!ok) renderStatus({ state: 'erro', message: 'O app foi fechado. Abra o TikSoda de novo.' }); },
});
