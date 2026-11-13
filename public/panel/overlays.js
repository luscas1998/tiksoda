import { escapeHtml, connectLive } from '/shared/live-client.js';
import { themeSelect, withTheme, themeOf } from './temas.js';

const $ = (id) => document.getElementById(id);

// Prévia: cada overlay roda num iframe reduzido, recebendo os mesmos eventos
// ao vivo. Só carrega quando aparece na tela (fica leve).
const PREVIEW_MAX_W = 320;
const PREVIEW_MAX_H = 240;
const CATS = [
  { id: '', label: 'Todos' },
  { id: 'live', label: '📣 Alertas e chat', slugs: ['eventos', 'alertas', 'chat', 'tts', 'contadores'] },
  { id: 'rank', label: '🏆 Rankings', slugs: ['ranking-likes', 'ranking-coins', 'ranking-mensal-likes', 'ranking-mensal-coins'] },
  { id: 'interativo', label: '🎡 Interativos', slugs: ['metas', 'roleta', 'midia', 'musica'] },
];

function previewHtml(o) {
  const [w, h] = String(o.size).split('x').map((n) => parseInt(n, 10) || 400);
  const scale = Math.min(PREVIEW_MAX_W / w, PREVIEW_MAX_H / h, 1);
  return `<div class="preview" style="width:${Math.round(w * scale)}px;height:${Math.round(h * scale)}px">
    <iframe data-src="/overlay/${o.slug}?previa=1" title="Prévia ${escapeHtml(o.name)}" tabindex="-1"
      style="width:${w}px;height:${h}px;transform:scale(${scale})"></iframe>
  </div>`;
}

function render(list, port) {
  const base = `http://localhost:${port}`;
  $('overlays').innerHTML = list.map((o) => `
    <li class="${o.ready ? '' : 'soon'}" data-slug="${o.slug}">
      <div class="ov-info">
        <b>${escapeHtml(o.name)}</b> ${o.ready ? '' : '<span class="tag">em breve</span>'}
        <p>${escapeHtml(o.description)} <span class="size">Tamanho sugerido: ${escapeHtml(o.size)}</span>${o.options && o.ready && !o.tab ? `<span class="size">Opções no link: <code>${escapeHtml(o.options)}</code></span>` : ''}</p>
        ${o.tab ? `<a class="button secondary small" href="${o.tab}">Abrir ${escapeHtml(o.name)} →</a>` : ''}
        ${o.themes ? `<div class="theme-row">Tema ${themeSelect('')}</div>` : ''}
        ${o.ready && !o.tab ? `<div class="row link-row">
          <input class="ov-link" value="${base}/overlay/${o.slug}" spellcheck="false" title="Dá pra editar: junte opções no fim, ex. ?top=3">
          <button class="secondary" data-copy>Copiar</button>
          <a class="secondary button ov-open" href="/overlay/${o.slug}" target="_blank">Abrir</a>
        </div>` : ''}
      </div>
      ${o.ready && !o.tab ? `<div class="ov-preview"><span class="preview-label">Prévia ao vivo</span>${previewHtml(o)}</div>` : ''}
    </li>`).join('');
  lazyFrames($('overlays'));
}

function renderCats() {
  $('cats').innerHTML = CATS.map((c, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-cat="${c.id}">${c.label}</button>`).join('');
}
$('cats').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  $('cats').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
  const cat = CATS.find((c) => c.id === b.dataset.cat);
  document.querySelectorAll('#overlays > li').forEach((li) => { li.hidden = !!cat.slugs && !cat.slugs.includes(li.dataset.slug); });
});

// Tema muda o link (?tema=...) e a prévia.
document.addEventListener('change', (e) => {
  const sel = e.target.closest('.overlays .theme-select');
  if (!sel) return;
  const input = sel.closest('li').querySelector('.ov-link');
  input.value = withTheme(input.value, sel.value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

// Editar o link atualiza a prévia e o botão Abrir.
let linkTimer;
document.addEventListener('input', (e) => {
  const input = e.target.closest('.ov-link');
  if (!input) return;
  clearTimeout(linkTimer);
  linkTimer = setTimeout(() => {
    const li = input.closest('li');
    const sel = li.querySelector('.theme-select');
    if (sel && sel.value !== themeOf(input.value)) sel.value = themeOf(input.value);
    let p, previewPath;
    try {
      const u = new URL(input.value);
      if (!u.pathname.startsWith('/overlay/')) return;
      p = u.pathname + u.search;
      u.searchParams.set('previa', '1');
      previewPath = u.pathname + u.search;
    } catch { return; }
    setFrameSrc(li.querySelector('iframe'), previewPath);
    li.querySelector('.ov-open').href = p;
  }, 400);
});

document.addEventListener('click', async (e) => {
  const copy = e.target.closest('[data-copy]');
  if (!copy) return;
  const input = copy.parentElement.querySelector('input');
  try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
  copy.textContent = 'Copiado!';
  toast('Link copiado. Cole no LIVE Studio em Adicionar fonte → Link.');
  setTimeout(() => (copy.textContent = 'Copiar'), 1500);
});

const info = await (await fetch('/api/status')).json();
renderCats();
render(info.overlays, info.port);
connectLive({}); // mantém o status do topo atualizado
