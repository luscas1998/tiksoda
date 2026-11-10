import { connectLive, escapeHtml, formatNumber } from '/shared/live-client.js';
import { createGiftPicker, setupGiftRefresh } from './gift-picker.js';

const $ = (id) => document.getElementById(id);
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
  return data;
};
const ON_COMPLETE_TXT = { recomecar: 'recomeça ao bater', manter: 'fica concluída ao bater', sumir: 'some ao bater' };
const PREVIEW = { w: 400, h: 400, scale: 0.5 };

let goals = [];
let port = 3330;
const picker = createGiftPicker({ search: $('gift-search'), grid: $('gift-grid'), empty: $('gift-empty'), chosenLabel: $('gift-chosen') });

// ---------- status ----------
const STATE_LABEL = { desconectado: 'Desconectado', conectando: 'Conectando…', conectado: 'Ao vivo', erro: 'Erro' };
function renderStatus(s) {
  $('status').className = `status ${s.state}`;
  $('status-text').textContent = s.state === 'conectado' ? `Ao vivo · @${s.username}` : STATE_LABEL[s.state] || s.state;
}

// ---------- mídia opcional ----------
async function loadMedia() {
  const media = await api('/api/midia');
  const icon = { audio: '🎵', video: '🎬', imagem: '🖼️' };
  $('media-file').innerHTML = '<option value="">Nada (só a comemoração na tela)</option>'
    + media.map((m) => `<option value="${escapeHtml(m.file)}">${icon[m.kind]} ${escapeHtml(m.file)}</option>`).join('');
}
$('volume').addEventListener('input', () => { $('volume-val').textContent = `${$('volume').value}%`; });

// ---------- formulário ----------
function formMsg(text, kind = '') { $('form-msg').className = `msg ${kind}`; $('form-msg').textContent = text; }

function resetForm() {
  $('edit-id').value = '';
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
  $('form-title').textContent = 'Nova meta de presente';
  $('cancel').hidden = true;
}
$('cancel').addEventListener('click', () => { resetForm(); formMsg(''); });

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const g = picker.value;
  if (!g) return formMsg('Escolha o presente.', 'err');
  const body = {
    name: $('name').value,
    giftId: g.giftId, giftName: g.giftName, giftImage: g.image || '',
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
function linkFor(g) { return `http://localhost:${port}/overlay/meta/${g.id}`; }

function renderGoals() {
  $('goals').innerHTML = goals.length ? goals.map((g) => `
    <li class="goal ${g.enabled ? '' : 'off'}" data-id="${g.id}">
      <div class="goal-head">
        <label class="switch" title="Ligar/desligar"><input type="checkbox" data-toggle ${g.enabled ? 'checked' : ''}><span></span></label>
        <div class="desc"><b>${escapeHtml(g.name || `Meta de ${g.giftName}`)}</b>
          <small>${escapeHtml(g.giftName)} · ${ON_COMPLETE_TXT[g.onComplete]}${g.media ? ` · toca ${escapeHtml(g.media.file)}` : ''}</small></div>
      </div>
      <div class="goal-body">
        <div class="preview" style="width:${PREVIEW.w * PREVIEW.scale}px;height:${PREVIEW.h * PREVIEW.scale}px">
          <iframe src="/overlay/meta/${g.id}?previa=1" tabindex="-1" title="Prévia"
            style="width:${PREVIEW.w}px;height:${PREVIEW.h}px;transform:scale(${PREVIEW.scale})"></iframe>
        </div>
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
          <p class="hint">Tamanho sugerido: 400 x 400. Opções: <code>?barra=0</code> <code>?cor=ff4f8b</code> <code>?tamanho=150</code></p>
        </div>
      </div>
    </li>`).join('') : '<li class="empty-msg">Nenhuma meta ainda. Crie a primeira ao lado.</li>';
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
      if (confirm('Zerar a contagem desta meta?')) await api(`/api/metas/${g.id}/zerar`, { method: 'POST' });
    } else if (t.matches('[data-del]')) {
      if (!confirm('Apagar esta meta? O link dela para de funcionar.')) return;
      await api(`/api/metas/${g.id}`, { method: 'DELETE' });
      await loadGoals();
    } else if (t.matches('[data-copy]')) {
      const input = t.parentElement.querySelector('input');
      try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
      t.textContent = 'Copiado!'; setTimeout(() => (t.textContent = 'Copiar'), 1500);
    } else if (t.matches('[data-edit]')) {
      $('edit-id').value = g.id;
      $('name').value = g.name;
      picker.value = { giftId: g.giftId, giftName: g.giftName, image: g.giftImage };
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
      formMsg('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) { alert(err.message); }
});

// ---------- carregar ----------
async function loadGoals() { goals = await api('/api/metas'); renderGoals(); }

const info = await api('/api/status');
port = info.port;
await Promise.all([loadMedia(), loadGoals(), api('/api/gifts').then((g) => picker.setGifts(g))]);
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
