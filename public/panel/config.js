import { connectLive } from '/shared/live-client.js';

const $ = (id) => document.getElementById(id);
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
  return data;
};
const local = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const setLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

async function load() {
  const [cfg, info, mensal] = await Promise.all([api('/api/config'), api('/api/status'), api('/api/mensal')]);
  $('username').value = cfg.username || '';
  $('my-username').value = mensal.myUsername || '';
  $('auto-connect').checked = cfg.autoConnect;
  $('auto-retry').checked = cfg.autoRetry;
  $('ver').textContent = `TikSoda ${info.version}${info.packaged ? ' (app do Windows)' : ''}`;
  $('data-dir').textContent = info.dataDir;
}

$('f-user').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/config', { method: 'PUT', body: JSON.stringify({ username: $('username').value }) });
  toast('@ da live salvo.');
});
$('f-my').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/mensal/meu-usuario', { method: 'POST', body: JSON.stringify({ username: $('my-username').value }) });
  toast('@ do ranking do mês salvo.');
});
for (const id of ['auto-connect', 'auto-retry']) {
  $(id).addEventListener('change', async () => {
    await api('/api/config', { method: 'PUT', body: JSON.stringify({ autoConnect: $('auto-connect').checked, autoRetry: $('auto-retry').checked }) });
    toast('Preferência salva.');
  });
}

$('previews').checked = local('tiksoda:previas', '1') !== '0';
$('previews').addEventListener('change', () => { setLocal('tiksoda:previas', $('previews').checked ? '1' : '0'); toast($('previews').checked ? 'Prévias ligadas.' : 'Prévias desligadas.'); });
$('anims').checked = local('tiksoda:anim', '1') !== '0';
$('anims').addEventListener('change', () => {
  setLocal('tiksoda:anim', $('anims').checked ? '1' : '0');
  document.documentElement.classList.toggle('no-anim', !$('anims').checked);
  toast('Preferência salva.');
});

$('restore').addEventListener('change', async () => {
  const file = $('restore').files[0];
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('Esse arquivo não é um backup válido.', 'err'); return; }
  if (!(await ask('Restaurar este backup? Ações, metas, roletas e TTS atuais serão trocados pelos do arquivo.', { ok: 'Restaurar', danger: true }))) return;
  try {
    const r = await api('/api/backup', { method: 'POST', body: JSON.stringify(data) });
    toast(`Backup restaurado (${r.restored.length} arquivos).`);
    load();
  } catch (err) { toast(err.message, 'err'); }
  $('restore').value = '';
});

$('quit').addEventListener('click', () => document.getElementById('btn-quit').click());

load();
connectLive({});
