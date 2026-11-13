import { connectLive, escapeHtml } from '/shared/live-client.js';
import { themeSelect, withTheme, previewOf, overlayBase } from './temas.js';

const $ = (id) => document.getElementById(id);
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
  return data;
};
const radio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;
const setRadio = (name, v) => { const el = document.querySelector(`input[name="${name}"][value="${v}"]`); if (el) el.checked = true; };
function renderStatus() { /* o status aparece no topo (shell.js) */ }
function formMsg(text, kind = '') { $('form-msg').className = `msg ${kind}`; $('form-msg').textContent = text; }

let isWindows = false;
let cfg = {};

// ---------- vozes ----------
async function loadVoices() {
  const engine = radio('engine');
  const sel = $('voice');
  let voices = [];
  if (engine === 'windows') {
    if (!isWindows) {
      $('voice-hint').textContent = 'Este computador não é Windows: o overlay vai usar a voz do navegador.';
    } else {
      $('voice-hint').textContent = 'Carregando vozes do Windows…';
      try {
        voices = await api('/api/tts/vozes');
        $('voice-hint').textContent = voices.some((v) => v.lang.startsWith('pt'))
          ? 'Vozes instaladas no seu Windows.'
          : 'Não achei voz em português no Windows. Instale em Configurações → Hora e idioma → Fala → Adicionar vozes.';
      } catch (err) { $('voice-hint').textContent = err.message; }
    }
  } else {
    voices = speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang }));
    $('voice-hint').textContent = 'Vozes deste navegador. No LIVE Studio a lista pode ser outra; se a escolhida não existir lá, ele usa uma voz em português. Em alguns programas de live a voz do navegador não sai no som; aí use a do Windows.';
  }
  voices.sort((a, b) => (b.lang.startsWith('pt') - a.lang.startsWith('pt')) || a.name.localeCompare(b.name));
  sel.innerHTML = '<option value="">Automática (português)</option>'
    + voices.map((v) => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)} (${escapeHtml(v.lang)})</option>`).join('');
  sel.value = voices.some((v) => v.name === cfg.voice) ? cfg.voice : '';
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { if (radio('engine') === 'navegador') loadVoices(); };

// ---------- formulário ----------
function sync() {
  const comando = radio('mode') === 'comando';
  $('command-field').hidden = !comando;
  const cmd = $('command').value.trim() || '!falar';
  $('command-hint').innerHTML = comando
    ? `No chat: <code>${escapeHtml(cmd)} boa noite pessoal</code> → lê "boa noite pessoal".`
    : 'Todo comentário vai ser lido (respeitando os filtros e a espera por pessoa).';
  $('mincoins-field').hidden = radio('who') !== 'presente';
  $('rate-val').textContent = Number($('rate').value) > 0 ? `+${$('rate').value}` : $('rate').value;
  $('volume-val').textContent = `${$('volume').value}%`;
}

function fill(c) {
  cfg = c;
  $('enabled').checked = c.enabled;
  setRadio('mode', c.mode);
  $('command').value = c.command;
  setRadio('who', c.who);
  $('min-coins').value = c.minCoins;
  $('template').value = c.template;
  $('max-chars').value = c.maxChars;
  $('cooldown').value = c.cooldown;
  $('max-queue').value = c.maxQueue;
  $('filter-bad').checked = c.filterBad;
  $('ignore-links').checked = c.ignoreLinks;
  $('blocked-words').value = c.blockedWords;
  $('ignored-users').value = c.ignoredUsers;
  setRadio('engine', c.engine);
  $('rate').value = c.rate;
  $('volume').value = c.volume;
  sync();
}

function collect() {
  return {
    enabled: $('enabled').checked,
    mode: radio('mode'),
    command: $('command').value,
    who: radio('who'),
    minCoins: Number($('min-coins').value),
    template: $('template').value,
    maxChars: Number($('max-chars').value),
    cooldown: Number($('cooldown').value),
    maxQueue: Number($('max-queue').value),
    filterBad: $('filter-bad').checked,
    ignoreLinks: $('ignore-links').checked,
    blockedWords: $('blocked-words').value,
    ignoredUsers: $('ignored-users').value,
    engine: radio('engine'),
    voice: $('voice').value,
    rate: Number($('rate').value),
    volume: Number($('volume').value),
  };
}

async function save(msg = 'Salvo.') {
  try {
    const { config } = await api('/api/tts', { method: 'PUT', body: JSON.stringify(collect()) });
    fill(config);
    formMsg(msg, 'ok');
  } catch (err) { formMsg(err.message, 'err'); }
}

$('form').addEventListener('input', sync);
$('form').addEventListener('change', (e) => { if (e.target.name === 'engine') loadVoices(); sync(); });
$('form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
$('enabled').addEventListener('change', () => save($('enabled').checked ? 'TTS ligado.' : 'TTS desligado.'));
$('reload-voices').addEventListener('click', loadVoices);

// ---------- teste ----------
$('test').addEventListener('submit', async (e) => {
  e.preventDefault();
  await save('Salvo. Falando…');
  await api('/api/tts/testar', { method: 'POST', body: JSON.stringify({ text: $('test-text').value }) });
});
$('skip').addEventListener('click', () => api('/api/tts/pular', { method: 'POST' }));
$('clear').addEventListener('click', () => api('/api/tts/limpar', { method: 'POST' }));

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
  const who = l.user ? `<b>${escapeHtml(l.user.nickname)}</b>: ` : '<b>Teste</b>: ';
  li.innerHTML = `<time>${time}</time>${l.ok ? '🔊 ' : '⏭ '}${who}${escapeHtml(l.text)}${l.ok ? '' : ` <span class="why">(${escapeHtml(l.reason)})</span>`}`;
  ul.prepend(li);
  while (ul.children.length > 60) ul.lastChild.remove();
}

// ---------- carregar ----------
const info = await api('/api/status');
base = `${overlayBase(info.port)}/overlay/tts`;
setLink('');
const data = await api('/api/tts');
isWindows = data.windows;
fill(data.config);
await loadVoices();

connectLive({
  onHello: ({ status }) => renderStatus(status),
  onStatus: renderStatus,
  onTtsLog: addLog,
});
