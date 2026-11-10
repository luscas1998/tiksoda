import { connectLive, escapeHtml, formatNumber } from '/shared/live-client.js';
import { setupGiftRefresh } from './gift-picker.js';

const $ = (id) => document.getElementById(id);
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
  return data;
};
const KIND_ICON = { audio: '🎵', video: '🎬', imagem: '🖼️' };

let gifts = [];
let media = [];
let rules = [];
let chosenGift = null; // { giftId, giftName, image }

// ---------- status no topo ----------
const STATE_LABEL = { desconectado: 'Desconectado', conectando: 'Conectando…', conectado: 'Ao vivo', erro: 'Erro' };
function renderStatus(s) {
  $('status').className = `status ${s.state}`;
  $('status-text').textContent = s.state === 'conectado' ? `Ao vivo · @${s.username}` : STATE_LABEL[s.state] || s.state;
}

// ---------- presentes ----------
function giftTile(g, selected) {
  const img = g.image ? `<img src="${escapeHtml(g.image)}" alt="" loading="lazy">` : '<span class="ph">🎁</span>';
  return `<button type="button" class="gift ${selected ? 'sel' : ''}" data-gift-id="${escapeHtml(g.id || '')}" data-gift-name="${escapeHtml(g.name)}">
    ${img}<span>${escapeHtml(g.name)}</span>${g.coins ? `<small>🪙 ${formatNumber(g.coins)}</small>` : ''}</button>`;
}

function renderGifts() {
  const q = $('gift-search').value.trim().toLowerCase();
  const list = gifts.filter((g) => !q || g.name.toLowerCase().includes(q));
  let html = list.map((g) => giftTile(g, chosenGift && (chosenGift.giftId ? chosenGift.giftId === g.id : chosenGift.giftName === g.name))).join('');
  const typed = $('gift-search').value.trim();
  if (typed && !gifts.some((g) => g.name.toLowerCase() === typed.toLowerCase())) {
    html += giftTile({ id: '', name: typed }, chosenGift && !chosenGift.giftId && chosenGift.giftName === typed);
  }
  $('gift-grid').innerHTML = html;
  $('gift-empty').textContent = gifts.length
    ? `${gifts.length} presentes conhecidos. A lista cresce sozinha conforme chegam presentes nas lives.`
    : 'A lista está vazia. Clique em "Atualizar lista do TikTok" pra baixar todos os presentes com ícone. O app também aprende sozinho com os presentes que chegam nas lives.';
  $('gift-chosen').textContent = chosenGift ? chosenGift.giftName : 'nenhum escolhido';
}

$('gift-search').addEventListener('input', renderGifts);
$('gift-grid').addEventListener('click', (e) => {
  const b = e.target.closest('.gift');
  if (!b) return;
  const g = gifts.find((x) => x.id && x.id === b.dataset.giftId);
  chosenGift = { giftId: b.dataset.giftId, giftName: b.dataset.giftName, image: g?.image || '' };
  renderGifts();
});

// ---------- biblioteca de mídia ----------
function renderMedia() {
  const sel = $('media-file');
  const cur = sel.value;
  sel.innerHTML = media.length
    ? media.map((m) => `<option value="${escapeHtml(m.file)}">${KIND_ICON[m.kind]} ${escapeHtml(m.file)}</option>`).join('')
    : '<option value="">Nenhuma mídia ainda: envie na biblioteca</option>';
  if (media.some((m) => m.file === cur)) sel.value = cur;

  $('media').innerHTML = media.length
    ? media.map((m) => `<li>
        <span class="icon">${KIND_ICON[m.kind]}</span>
        <div class="desc">${escapeHtml(m.file)}<small>${m.size >= 1048576 ? (m.size / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(m.size / 1024)) + ' KB'}</small></div>
        <button class="secondary small" data-local="${escapeHtml(m.url)}" data-kind="${m.kind}">Ouvir aqui</button>
        <button class="secondary small" data-send="${escapeHtml(m.file)}" title="Toca no overlay de áudio e vídeo">Tocar no overlay</button>
        <button class="secondary small" data-del-media="${escapeHtml(m.file)}">Apagar</button>
      </li>`).join('')
    : '<li class="empty-msg">Nenhum arquivo ainda.</li>';
}

let localPlayer = null;
$('media').addEventListener('click', async (e) => {
  const t = e.target;
  if (t.dataset.local) {
    localPlayer?.pause();
    if (t.dataset.kind === 'imagem') { window.open(t.dataset.local, '_blank'); return; }
    localPlayer = new Audio(t.dataset.local);
    localPlayer.play();
  } else if (t.dataset.send) {
    await api(`/api/midia/${encodeURIComponent(t.dataset.send)}/tocar`, { method: 'POST' });
  } else if (t.dataset.delMedia) {
    if (!confirm(`Apagar ${t.dataset.delMedia}?`)) return;
    try { await api(`/api/midia/${encodeURIComponent(t.dataset.delMedia)}`, { method: 'DELETE' }); await loadMedia(); }
    catch (err) { alert(err.message); }
  }
});

$('upload').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  const msg = $('upload-msg');
  for (const [i, f] of files.entries()) {
    msg.className = 'msg';
    msg.textContent = `Enviando ${i + 1}/${files.length}: ${f.name}…`;
    try {
      const res = await fetch('/api/midia', { method: 'POST', headers: { 'x-filename': encodeURIComponent(f.name), 'Content-Type': 'application/octet-stream' }, body: f });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (err) {
      msg.className = 'msg err';
      msg.textContent = `${f.name}: ${err.message}`;
      e.target.value = '';
      await loadMedia();
      return;
    }
  }
  msg.className = 'msg ok';
  msg.textContent = files.length > 1 ? `${files.length} arquivos enviados.` : 'Arquivo enviado.';
  e.target.value = '';
  await loadMedia();
});

// ---------- formulário ----------
const triggerType = () => document.querySelector('input[name=trigger]:checked').value;
function syncTriggerFields() {
  $('gift-fields').hidden = triggerType() !== 'gift';
  $('likes-fields').hidden = triggerType() !== 'likes';
}
document.querySelectorAll('input[name=trigger]').forEach((r) => r.addEventListener('change', syncTriggerFields));
$('volume').addEventListener('input', () => { $('volume-val').textContent = `${$('volume').value}%`; });

function formMsg(text, kind = '') { $('form-msg').className = `msg ${kind}`; $('form-msg').textContent = text; }

function resetForm() {
  $('edit-id').value = '';
  $('name').value = '';
  chosenGift = null;
  $('gift-search').value = '';
  $('repeat').value = 'uma';
  $('likes-mode').value = 'cada';
  $('likes-amount').value = 1000;
  $('volume').value = 100; $('volume-val').textContent = '100%';
  $('save').textContent = 'Salvar ação';
  $('cancel').hidden = true;
  document.querySelector('input[name=trigger][value=gift]').checked = true;
  syncTriggerFields();
  renderGifts();
}

$('cancel').addEventListener('click', () => { resetForm(); formMsg(''); });

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = triggerType();
  if (type === 'gift' && !chosenGift) return formMsg('Escolha o presente.', 'err');
  const body = {
    name: $('name').value,
    trigger: type === 'gift'
      ? { type, giftId: chosenGift.giftId, giftName: chosenGift.giftName, repeat: $('repeat').value }
      : { type, mode: $('likes-mode').value, amount: Number($('likes-amount').value) },
    media: { file: $('media-file').value, volume: Number($('volume').value) },
  };
  const id = $('edit-id').value;
  try {
    await api(id ? `/api/acoes/${id}` : '/api/acoes', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    formMsg(id ? 'Ação atualizada.' : 'Ação criada.', 'ok');
    resetForm();
    await loadRules();
  } catch (err) { formMsg(err.message, 'err'); }
});

// ---------- lista de ações ----------
function describeRule(r) {
  const t = r.trigger;
  const REPEAT_TXT = { fila: ' (repete pela quantidade)', cortar: ' (corta e repete a cada presente)' };
  if (t.type === 'gift') return `Ao receber <b>${escapeHtml(t.giftName)}</b>${REPEAT_TXT[t.repeat || (t.perUnit ? 'fila' : 'uma')] || ''}`;
  return t.mode === 'meta' ? `Ao chegar em <b>${formatNumber(t.amount)} likes</b> na live` : `A cada <b>${formatNumber(t.amount)} likes</b>`;
}

function renderRules() {
  $('rules').innerHTML = rules.length
    ? rules.map((r) => {
        const g = r.trigger.giftId && gifts.find((x) => x.id === r.trigger.giftId);
        const icon = r.trigger.type === 'likes' ? '<span class="icon">❤️</span>' : g?.image ? `<img src="${escapeHtml(g.image)}" alt="">` : '<span class="icon">🎁</span>';
        const kind = media.find((m) => m.file === r.media.file)?.kind;
        return `<li class="${r.enabled ? '' : 'off'}" data-id="${r.id}">
          <label class="switch" title="Ligar/desligar"><input type="checkbox" data-toggle ${r.enabled ? 'checked' : ''}><span></span></label>
          ${icon}
          <div class="desc">${r.name ? `<b>${escapeHtml(r.name)}</b><br>` : ''}${describeRule(r)}
            <small>${KIND_ICON[kind] || '⚠️'} ${escapeHtml(r.media.file)} · volume ${r.media.volume}%</small></div>
          <button class="secondary small" data-test>Testar</button>
          <button class="secondary small" data-edit>Editar</button>
          <button class="secondary small" data-del>Apagar</button>
        </li>`;
      }).join('')
    : '<li class="empty-msg">Nenhuma ação ainda. Crie a primeira ao lado.</li>';
}

$('rules').addEventListener('click', async (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const r = rules.find((x) => x.id === li.dataset.id);
  try {
    if (e.target.matches('[data-toggle]')) {
      await api(`/api/acoes/${r.id}`, { method: 'PUT', body: JSON.stringify({ enabled: e.target.checked }) });
      await loadRules();
    } else if (e.target.matches('[data-test]')) {
      await api(`/api/acoes/${r.id}/testar`, { method: 'POST' });
    } else if (e.target.matches('[data-del]')) {
      if (!confirm('Apagar esta ação?')) return;
      await api(`/api/acoes/${r.id}`, { method: 'DELETE' });
      await loadRules();
    } else if (e.target.matches('[data-edit]')) {
      $('edit-id').value = r.id;
      $('name').value = r.name;
      document.querySelector(`input[name=trigger][value=${r.trigger.type}]`).checked = true;
      if (r.trigger.type === 'gift') {
        chosenGift = { giftId: r.trigger.giftId, giftName: r.trigger.giftName };
        $('repeat').value = r.trigger.repeat || (r.trigger.perUnit ? 'fila' : 'uma');
        $('gift-search').value = '';
      } else {
        $('likes-mode').value = r.trigger.mode;
        $('likes-amount').value = r.trigger.amount;
      }
      $('media-file').value = r.media.file;
      $('volume').value = r.media.volume; $('volume-val').textContent = `${r.media.volume}%`;
      $('save').textContent = 'Salvar alterações';
      $('cancel').hidden = false;
      syncTriggerFields();
      renderGifts();
      formMsg('Editando ação.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) { alert(err.message); }
});

// ---------- carregar ----------
async function loadMedia() { media = await api('/api/midia'); renderMedia(); renderRules(); }
async function loadRules() { rules = await api('/api/acoes'); renderRules(); }
async function loadGifts() { gifts = await api('/api/gifts'); renderGifts(); renderRules(); }

await Promise.all([loadMedia(), loadRules(), loadGifts()]);
syncTriggerFields();
setupGiftRefresh($('gift-refresh'), $('gift-refresh-msg'), loadGifts);
setInterval(loadGifts, 30000); // pega presentes novos aprendidos durante a live

connectLive({
  onHello: ({ status }) => renderStatus(status),
  onStatus: renderStatus,
});
