import { connectLive, escapeHtml, formatNumber } from '/shared/live-client.js';
import { createGiftPicker, setupGiftRefresh } from './gift-picker.js';
import { themeSelect, withTheme, previewOf, overlayBase } from './temas.js';

const $ = (id) => document.getElementById(id);
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
  return data;
};
const ON_COMPLETE_TXT = { recomecar: 'recomeça ao bater', aumentar: 'aumenta ao bater', manter: 'fica concluída ao bater', sumir: 'some ao bater' };
const KIND_INFO = {
  gift: { icon: '🎁', name: 'Presente' },
  likes: { icon: '❤️', name: 'Likes' },
  follows: { icon: '💗', name: 'Seguidores' },
  shares: { icon: '🔁', name: 'Shares' },
  coins: { icon: '🪙', name: 'Coins' },
};
const MODEL_INFO = {
  presente: { name: 'presente pulsando', size: [400, 400] },
  barra: { name: 'barra', size: [640, 170] },
  circulo: { name: 'círculo', size: [400, 400] },
  numero: { name: 'número grande', size: [480, 260] },
  copo: { name: 'copo enchendo', size: [320, 440] },
};
const themes = {}; // tema escolhido por meta (fica só no link)

let goals = [];
let port = 3330;
const picker = createGiftPicker({ search: $('gift-search'), grid: $('gift-grid'), empty: $('gift-empty'), chosenLabel: $('gift-chosen'), onChange: () => updateDemo() });

// ---------- status ----------
function renderStatus() { /* o status aparece no topo (shell.js) */ }

// ---------- mídia opcional ----------
async function loadMedia() {
  const media = await api('/api/midia');
  const icon = { audio: '🎵', video: '🎬', imagem: '🖼️' };
  $('media-file').innerHTML = '<option value="">Nada (só a comemoração na tela)</option>'
    + media.map((m) => `<option value="${escapeHtml(m.file)}">${icon[m.kind]} ${escapeHtml(m.file)}</option>`).join('');
}
$('volume').addEventListener('input', () => { $('volume-val').textContent = `${$('volume').value}%`; });

// ---------- formulário ----------
const radio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;
const setRadio = (name, v) => { const el = document.querySelector(`input[name="${name}"][value="${v}"]`); if (el) el.checked = true; };

function syncForm() {
  const kind = radio('kind');
  const isGift = kind === 'gift';
  $('gift-field').hidden = !isGift;
  document.querySelector('[data-only-gift]').hidden = !isGift;
  if (!isGift && radio('model') === 'presente') setRadio('model', 'barra');
  $('show-top-field').hidden = !['gift', 'likes', 'coins'].includes(kind);
  $('step-field').hidden = $('on-complete').value !== 'aumentar';
  updateDemo();
}

let demoTimer;
function updateDemo() {
  clearTimeout(demoTimer);
  demoTimer = setTimeout(() => {
    const g = picker.value;
    const q = new URLSearchParams({
      previa: '1', tipo: radio('kind'), modelo: radio('model'), meta: String(Math.max(1, Number($('target').value) || 10)),
      topo: $('text-top').value, baixo: $('text-bottom').value,
    });
    if (g) { q.set('presente', g.giftName); if (g.image) q.set('imagem', g.image); }
    $('demo').src = `/overlay/meta/demo?${q}`;
  }, 300);
}
for (const id of ['kind', 'model']) $(id).addEventListener('change', syncForm);
$('on-complete').addEventListener('change', syncForm);
for (const id of ['target', 'text-top', 'text-bottom']) $(id).addEventListener('input', updateDemo);

function formMsg(text, kind = '') { $('form-msg').className = `msg ${kind}`; $('form-msg').textContent = text; }

function resetForm() {
  $('edit-id').value = '';
  setRadio('kind', 'gift');
  setRadio('model', 'presente');
  $('step').value = 10;
  $('reset-new-live').checked = false;
  $('name').value = '';
  picker.value = null;
  $('target').value = 10;
  $('text-top').value = '';
  $('text-bottom').value = '{atual}/{meta}';
  $('on-complete').value = 'recomecar';
  $('media-file').value = '';
  $('volume').value = 100; $('volume-val').textContent = '100%';
  $('show-top').checked = true;
  $('save').textContent = 'Criar meta';
  $('form-title').textContent = 'Nova meta';
  $('cancel').hidden = true;
  syncForm();
}
$('cancel').addEventListener('click', () => { resetForm(); formMsg(''); });

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const kind = radio('kind');
  const g = kind === 'gift' ? picker.value : null;
  if (kind === 'gift' && !g) return formMsg('Escolha o presente.', 'err');
  const body = {
    name: $('name').value,
    kind,
    model: radio('model'),
    step: Number($('step').value),
    resetOnNewLive: $('reset-new-live').checked,
    giftId: g?.giftId || '', giftName: g?.giftName || '', giftImage: g?.image || '',
    target: Number($('target').value),
    textTop: $('text-top').value,
    textBottom: $('text-bottom').value,
    onComplete: $('on-complete').value,
    showTop: $('show-top').checked,
    media: $('media-file').value ? { file: $('media-file').value, volume: Number($('volume').value) } : null,
  };
  const id = $('edit-id').value;
  try {
    await api(id ? `/api/metas/${id}` : '/api/metas', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    formMsg(id ? 'Meta atualizada.' : 'Meta criada. O link dela está ao lado.', 'ok');
    resetForm();
    await loadGoals();
  } catch (err) { formMsg(err.message, 'err'); }
});

// ---------- lista ----------
function linkFor(g) { return withTheme(`${overlayBase(port)}/overlay/meta/${g.id}`, themes[g.id] || ''); }
const goalTitle = (g) => g.name || (g.kind === 'gift' || !g.kind ? `Meta de ${g.giftName}` : `Meta de ${KIND_INFO[g.kind].name.toLowerCase()}`);

function previewBox(g) {
  const [w, h] = (MODEL_INFO[g.model] || MODEL_INFO.presente).size;
  const scale = Math.min(220 / w, 220 / h);
  return `<div class="preview" style="width:${Math.round(w * scale)}px;height:${Math.round(h * scale)}px">
    <iframe data-src="${previewOf(linkFor(g))}" tabindex="-1" title="Prévia"
      style="width:${w}px;height:${h}px;transform:scale(${scale})"></iframe>
  </div>`;
}

function renderGoals() {
  $('goals').innerHTML = goals.length ? goals.map((g) => `
    <li class="goal ${g.enabled ? '' : 'off'}" data-id="${g.id}">
      <div class="goal-head">
        <label class="switch" title="Ligar/desligar"><input type="checkbox" data-toggle ${g.enabled ? 'checked' : ''}><span></span></label>
        <span class="kind">${g.giftImage ? `<img src="${escapeHtml(g.giftImage)}" alt="" width="28" height="28">` : (KIND_INFO[g.kind] || KIND_INFO.gift).icon}</span>
        <div class="desc"><b>${escapeHtml(goalTitle(g))}</b>
          <small>${escapeHtml(g.kind === 'gift' ? g.giftName : KIND_INFO[g.kind].name)} · ${(MODEL_INFO[g.model] || MODEL_INFO.presente).name} · ${ON_COMPLETE_TXT[g.onComplete]}${g.resetOnNewLive ? ' · zera a cada live' : ''}${g.media ? ` · toca ${escapeHtml(g.media.file)}` : ''}</small></div>
      </div>
      <div class="goal-body">
        ${previewBox(g)}
        <div class="goal-side">
          <div class="count" data-count></div>
          <div class="progress"><div data-bar></div></div>
          <div class="btns">
            <button class="secondary small" data-adj="-1">−1</button>
            <button class="secondary small" data-adj="1">+1</button>
            <button class="secondary small" data-reset>Zerar</button>
            <button class="secondary small" data-edit>Editar</button>
            <button class="secondary small" data-del>Apagar</button>
          </div>
          <div class="row link-row">
            <input readonly value="${linkFor(g)}">
            <button class="secondary small" data-copy>Copiar</button>
          </div>
          <div class="theme-row">Tema ${themeSelect(themes[g.id] || '')}</div>
          <p class="hint">Tamanho sugerido: ${(MODEL_INFO[g.model] || MODEL_INFO.presente).size.join(' x ')}. Opções: <code>?cor=ff4f8b</code> <code>?tamanho=150</code>${g.model === 'presente' ? ' <code>?barra=0</code>' : ''}</p>
        </div>
      </div>
    </li>`).join('') : '<li class="empty-msg">Nenhuma meta ainda. Crie a primeira ao lado.</li>';
  lazyFrames($('goals'));
  updateCounts();
}

function updateCounts() {
  for (const g of goals) {
    const li = document.querySelector(`.goal[data-id="${g.id}"]`);
    if (!li) continue;
    const status = g.completed ? ' <small>concluída ✓</small>' : g.times ? ` <small>bateu ${g.times}x</small>` : '';
    li.querySelector('[data-count]').innerHTML = `${formatNumber(g.count)} / ${formatNumber(g.target)}${status}`;
    li.querySelector('[data-bar]').style.width = `${Math.min(100, (g.count / g.target) * 100)}%`;
  }
}

$('goals').addEventListener('change', (e) => {
  if (!e.target.matches('.theme-select')) return;
  const li = e.target.closest('.goal');
  const g = goals.find((x) => x.id === li.dataset.id);
  themes[g.id] = e.target.value;
  li.querySelector('.link-row input').value = linkFor(g);
  setFrameSrc(li.querySelector('iframe'), previewOf(linkFor(g)));
});

$('goals').addEventListener('click', async (e) => {
  const li = e.target.closest('.goal');
  if (!li) return;
  const g = goals.find((x) => x.id === li.dataset.id);
  const t = e.target;
  try {
    if (t.matches('[data-toggle]')) {
      await api(`/api/metas/${g.id}`, { method: 'PUT', body: JSON.stringify({ enabled: t.checked }) });
      await loadGoals();
    } else if (t.dataset.adj) {
      await api(`/api/metas/${g.id}/ajustar`, { method: 'POST', body: JSON.stringify({ amount: Number(t.dataset.adj) }) });
    } else if (t.matches('[data-reset]')) {
      if (await ask('Zerar a contagem desta meta?')) await api(`/api/metas/${g.id}/zerar`, { method: 'POST' });
    } else if (t.matches('[data-del]')) {
      if (!await ask('Apagar esta meta? O link dela para de funcionar.', { ok: 'Apagar', danger: true })) return;
      await api(`/api/metas/${g.id}`, { method: 'DELETE' });
      await loadGoals();
    } else if (t.matches('[data-copy]')) {
      const input = t.parentElement.querySelector('input');
      try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
      t.textContent = 'Copiado!'; setTimeout(() => (t.textContent = 'Copiar'), 1500);
    } else if (t.matches('[data-edit]')) {
      $('edit-id').value = g.id;
      setRadio('kind', g.kind || 'gift');
      setRadio('model', g.model || 'presente');
      $('step').value = g.step || g.target;
      $('reset-new-live').checked = !!g.resetOnNewLive;
      $('name').value = g.name;
      picker.value = g.kind === 'gift' || !g.kind ? { giftId: g.giftId, giftName: g.giftName, image: g.giftImage } : null;
      $('target').value = g.target;
      $('text-top').value = g.textTop;
      $('text-bottom').value = g.textBottom;
      $('on-complete').value = g.onComplete;
      $('media-file').value = g.media?.file || '';
      $('volume').value = g.media?.volume ?? 100; $('volume-val').textContent = `${$('volume').value}%`;
      $('show-top').checked = g.showTop;
      $('save').textContent = 'Salvar alterações';
      $('form-title').textContent = 'Editar meta';
      $('cancel').hidden = false;
      syncForm();
      formMsg('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) { toast(err.message, 'err'); }
});

// ---------- carregar ----------
async function loadGoals() { goals = await api('/api/metas'); renderGoals(); }

const info = await api('/api/status');
port = info.port;
await Promise.all([loadMedia(), loadGoals(), api('/api/gifts').then((g) => picker.setGifts(g))]);
syncForm();
setupGiftRefresh($('gift-refresh'), $('gift-refresh-msg'), () => api('/api/gifts').then((g) => picker.setGifts(g)));
setInterval(() => api('/api/gifts').then((g) => picker.setGifts(g)).catch(() => {}), 30000);

connectLive({
  onHello: ({ status }) => renderStatus(status),
  onStatus: renderStatus,
  onGoals: (list) => {
    const sameSet = list.length === goals.length && list.every((g, i) => g.id === goals[i].id);
    goals = list;
    if (sameSet) updateCounts(); else renderGoals();
  },
});
