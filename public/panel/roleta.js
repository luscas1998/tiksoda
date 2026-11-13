import { connectLive, escapeHtml } from '/shared/live-client.js';
import { createGiftPicker, setupGiftRefresh } from './gift-picker.js';
import { themeSelect, withTheme, previewOf, overlayBase } from './temas.js';

const $ = (id) => document.getElementById(id);
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
  return data;
};
const COLORS = ['#ff4f8b', '#25f4ee', '#ffc93c', '#9a8cff', '#3ddc84', '#ff8a3d', '#4f9dff', '#f25cf2'];
const KIND_ICON = { audio: '🎵', video: '🎬', imagem: '🖼️' };
const PREVIEW = { w: 500, h: 600, scale: 0.4 };
function renderStatus() { /* o status aparece no topo (shell.js) */ }
function formMsg(text, kind = '') { $('form-msg').className = `msg ${kind}`; $('form-msg').textContent = text; }

let wheels = [];
let media = [];
let port = 3330;
const themes = {};
const picker = createGiftPicker({ search: $('gift-search'), grid: $('gift-grid'), empty: $('gift-empty'), chosenLabel: $('gift-chosen') });
$('gift-clear').addEventListener('click', () => { picker.value = null; });

// ---------- opções ----------
function mediaOptions(cur) {
  return '<option value="">Sem mídia</option>' + media.map((m) =>
    `<option value="${escapeHtml(m.file)}" ${m.file === cur ? 'selected' : ''}>${KIND_ICON[m.kind]} ${escapeHtml(m.file)}</option>`).join('');
}
function addOption(o = {}) {
  const i = $('options').children.length;
  const li = document.createElement('li');
  li.innerHTML = `<input type="color" class="o-color" value="${o.color || COLORS[i % COLORS.length]}">
    <input class="o-label" placeholder="Opção ${i + 1}" maxlength="40" value="${escapeHtml(o.label || '')}">
    <input class="o-weight" type="number" min="1" max="100" value="${o.weight || 1}" title="Peso (chance)">
    <select class="o-media">${mediaOptions(o.media?.file || '')}</select>
    <button type="button" class="secondary small" data-remove title="Tirar">✕</button>`;
  $('options').appendChild(li);
}
$('add-option').addEventListener('click', () => addOption());
$('options').addEventListener('click', (e) => { if (e.target.matches('[data-remove]')) e.target.closest('li').remove(); });
const collectOptions = () => [...$('options').children].map((li) => ({
  label: li.querySelector('.o-label').value,
  color: li.querySelector('.o-color').value,
  weight: Number(li.querySelector('.o-weight').value),
  media: li.querySelector('.o-media').value ? { file: li.querySelector('.o-media').value, volume: 100 } : null,
}));

// ---------- formulário ----------
function resetForm() {
  $('edit-id').value = '';
  $('name').value = '';
  $('title').value = '';
  $('options').innerHTML = '';
  ['Dança', 'Prenda', 'Imitação', 'Verdade', 'Desafio', 'Salve'].forEach((label) => addOption({ label }));
  $('command').value = '!roleta';
  $('command-who').value = 'todos';
  $('cooldown').value = 30;
  picker.value = null;
  $('gift-mode').value = 'uma';
  $('spin-seconds').value = 6;
  $('show-seconds').value = 5;
  $('hide-idle').checked = true;
  $('save').textContent = 'Criar roleta';
  $('form-title').textContent = 'Nova roleta';
  $('cancel').hidden = true;
}
$('cancel').addEventListener('click', () => { resetForm(); formMsg(''); });

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const g = picker.value;
  const body = {
    name: $('name').value,
    title: $('title').value,
    options: collectOptions(),
    command: $('command').value,
    commandWho: $('command-who').value,
    cooldown: Number($('cooldown').value),
    giftId: g?.giftId || '', giftName: g?.giftName || '', giftImage: g?.image || '',
    giftMode: $('gift-mode').value,
    spinSeconds: Number($('spin-seconds').value),
    showSeconds: Number($('show-seconds').value),
    hideIdle: $('hide-idle').checked,
  };
  const id = $('edit-id').value;
  try {
    await api(id ? `/api/roletas/${id}` : '/api/roletas', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    formMsg(id ? 'Roleta atualizada.' : 'Roleta criada. O link dela está ao lado.', 'ok');
    resetForm();
    await loadWheels();
  } catch (err) { formMsg(err.message, 'err'); }
});

// ---------- lista ----------
const linkFor = (w) => withTheme(`${overlayBase(port)}/overlay/roleta/${w.id}`, themes[w.id] || '');
function triggers(w) {
  const t = [];
  if (w.command) t.push(`comando ${w.command}${w.commandWho === 'presente' ? ' (só quem mandou presente)' : ''}`);
  if (w.giftId || w.giftName) t.push(`presente ${w.giftName}${w.giftMode === 'cada' ? ' (1 giro por presente)' : ''}`);
  return t.length ? t.join(' · ') : 'só pelo botão';
}
function historyHtml(w) {
  const h = w.history || [];
  return h.length
    ? h.slice(0, 8).map((x) => `<li><b>${escapeHtml(x.label)}</b>${x.user ? ` · ${escapeHtml(x.user)}` : ''} <small>(${escapeHtml(x.reason)})</small></li>`).join('')
    : '<li>Nenhum giro ainda.</li>';
}

function renderWheels() {
  $('wheels').innerHTML = wheels.length ? wheels.map((w) => `
    <li class="goal ${w.enabled ? '' : 'off'}" data-id="${w.id}">
      <div class="goal-head">
        <label class="switch" title="Ligar/desligar"><input type="checkbox" data-toggle ${w.enabled ? 'checked' : ''}><span></span></label>
        <div class="desc"><b>${escapeHtml(w.name || w.title || 'Roleta')}</b>
          <small>${w.options.length} opções · ${escapeHtml(triggers(w))}</small></div>
        <button class="small" data-spin>🎡 Girar</button>
      </div>
      <div class="goal-body">
        <div class="preview" style="width:${PREVIEW.w * PREVIEW.scale}px;height:${PREVIEW.h * PREVIEW.scale}px">
          <iframe data-src="${previewOf(linkFor(w))}" tabindex="-1" title="Prévia"
            style="width:${PREVIEW.w}px;height:${PREVIEW.h}px;transform:scale(${PREVIEW.scale})"></iframe>
        </div>
        <div class="goal-side">
          <span class="label">Últimos resultados</span>
          <ol class="history-list" data-history>${historyHtml(w)}</ol>
          <div class="btns">
            <button class="secondary small" data-edit>Editar</button>
            <button class="secondary small" data-del>Apagar</button>
          </div>
          <div class="row link-row"><input readonly value="${linkFor(w)}"><button class="secondary small" data-copy>Copiar</button></div>
          <div class="theme-row">Tema ${themeSelect(themes[w.id] || '')}</div>
          <p class="hint">Tamanho sugerido: 500 x 600. Opções: <code>?tamanho=420</code> <code>?sempre=1</code> (não esconde)</p>
        </div>
      </div>
    </li>`).join('') : '<li class="empty-msg">Nenhuma roleta ainda. Crie a primeira ao lado.</li>';
  lazyFrames($('wheels'));
}

$('wheels').addEventListener('change', (e) => {
  if (!e.target.matches('.theme-select')) return;
  const li = e.target.closest('.goal');
  const w = wheels.find((x) => x.id === li.dataset.id);
  themes[w.id] = e.target.value;
  li.querySelector('.link-row input').value = linkFor(w);
  setFrameSrc(li.querySelector('iframe'), previewOf(linkFor(w)));
});

$('wheels').addEventListener('click', async (e) => {
  const li = e.target.closest('.goal');
  if (!li) return;
  const w = wheels.find((x) => x.id === li.dataset.id);
  const t = e.target;
  try {
    if (t.matches('[data-toggle]')) {
      await api(`/api/roletas/${w.id}`, { method: 'PUT', body: JSON.stringify({ enabled: t.checked }) });
      await loadWheels();
    } else if (t.matches('[data-spin]')) {
      await api(`/api/roletas/${w.id}/girar`, { method: 'POST' });
      setTimeout(loadWheels, 300);
    } else if (t.matches('[data-del]')) {
      if (!await ask('Apagar esta roleta? O link dela para de funcionar.', { ok: 'Apagar', danger: true })) return;
      await api(`/api/roletas/${w.id}`, { method: 'DELETE' });
      await loadWheels();
    } else if (t.matches('[data-copy]')) {
      const input = t.parentElement.querySelector('input');
      try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
      t.textContent = 'Copiado!'; setTimeout(() => (t.textContent = 'Copiar'), 1500);
    } else if (t.matches('[data-edit]')) {
      $('edit-id').value = w.id;
      $('name').value = w.name;
      $('title').value = w.title;
      $('options').innerHTML = '';
      w.options.forEach(addOption);
      $('command').value = w.command;
      $('command-who').value = w.commandWho;
      $('cooldown').value = w.cooldown;
      picker.value = w.giftId || w.giftName ? { giftId: w.giftId, giftName: w.giftName, image: w.giftImage } : null;
      $('gift-mode').value = w.giftMode;
      $('spin-seconds').value = w.spinSeconds;
      $('show-seconds').value = w.showSeconds;
      $('hide-idle').checked = w.hideIdle;
      $('save').textContent = 'Salvar alterações';
      $('form-title').textContent = 'Editar roleta';
      $('cancel').hidden = false;
      formMsg('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) { toast(err.message, 'err'); }
});

// ---------- carregar ----------
async function loadWheels() {
  const list = await api('/api/roletas');
  const sameSet = list.length === wheels.length && list.every((w, i) => w.id === wheels[i].id && JSON.stringify(w.options) === JSON.stringify(wheels[i].options) && w.enabled === wheels[i].enabled);
  wheels = list;
  if (sameSet) {
    for (const w of wheels) {
      const el = document.querySelector(`.goal[data-id="${w.id}"] [data-history]`);
      if (el) el.innerHTML = historyHtml(w);
    }
  } else renderWheels();
}

const info = await api('/api/status');
port = info.port;
media = await api('/api/midia');
resetForm();
await Promise.all([loadWheels(), api('/api/gifts').then((g) => picker.setGifts(g))]);
setupGiftRefresh($('gift-refresh'), $('gift-refresh-msg'), () => api('/api/gifts').then((g) => picker.setGifts(g)));

let refreshTimer;
connectLive({
  onHello: ({ status }) => renderStatus(status),
  onStatus: renderStatus,
  onWheels: () => loadWheels(),
  onWheelSpin: (spin) => {
    // Atualiza o histórico quando o giro termina.
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(loadWheels, Math.max(0, spin.startAt + spin.spinMs - Date.now()) + 200);
  },
});
