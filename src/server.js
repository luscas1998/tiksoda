import express from 'express';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { ROOT, DATA_DIR, PACKAGED, setupLog, openPanel, openFolder, shortcutsSupported, shortcutExists, setShortcut } from './app.js';
import { WebSocketServer } from 'ws';
import { LiveManager } from './live.js';
import { simulate, simulateCombo } from './simulate.js';
import { OVERLAYS } from './overlays.js';
import { Session } from './session.js';
import { GiftCatalog } from './gifts.js';
import { MediaLibrary } from './media.js';
import { ActionRules } from './actions.js';
import { GiftGoals } from './goals.js';
import { MonthlyRanking } from './monthly.js';
import { importTikTokGifts } from './giftImport.js';
import { TextToSpeech } from './tts.js';
import { Wheels } from './wheels.js';
import { Spotify } from './spotify.js';

setupLog();
const VERSION = '0.7.0';
const OPEN_PANEL = PACKAGED || process.argv.includes('--abrir');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PORT = Number(process.env.PORT) || 3330;

// ---------- configuração salva em disco ----------
function loadConfig() {
  try { return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
// username: o @ da live (fica salvo até você trocar)
// autoConnect: conectar sozinho quando o app abre · autoRetry: esperar a live começar / reconectar se cair
function publicConfig() { return { autoConnect: true, autoRetry: true, ...loadConfig() }; }
function saveConfig(patch) {
  const cfg = { ...loadConfig(), ...patch };
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  return cfg;
}

// ---------- servidor web ----------
const app = express();
app.use(express.json());
app.use('/shared', express.static(path.join(ROOT, 'public/shared')));
app.use('/painel', express.static(path.join(ROOT, 'public/panel')));
app.get('/', (_req, res) => res.redirect('/painel/'));

// Cada meta de presente tem seu próprio link.
app.get('/overlay/meta/:id', (_req, res) => res.sendFile(path.join(ROOT, 'public/overlay', 'meta.html')));
// Cada roleta também.
app.get('/overlay/roleta/:id', (_req, res) => res.sendFile(path.join(ROOT, 'public/overlay', 'roleta.html')));

app.get('/overlay/:slug', (req, res) => {
  const ov = OVERLAYS.find((o) => o.slug === req.params.slug && o.ready && !o.tab);
  if (!ov) return res.status(404).send('Overlay não encontrado.');
  res.sendFile(path.join(ROOT, 'public/overlay', `${ov.file || ov.slug}.html`));
});

const live = new LiveManager();
const session = new Session(DATA_DIR);
const gifts = new GiftCatalog(DATA_DIR);
const media = new MediaLibrary(DATA_DIR);
const actions = new ActionRules(DATA_DIR, media);
const goals = new GiftGoals(DATA_DIR, media);
const monthly = new MonthlyRanking(DATA_DIR);
const tts = new TextToSpeech(DATA_DIR);
const wheels = new Wheels(DATA_DIR, media);
const spotify = new Spotify(DATA_DIR, PORT);
let config = loadConfig();
live.autoRetry = publicConfig().autoRetry;

// Quantos coins a pessoa já mandou nesta live (pra regras "só quem mandou presente").
const coinsOf = (user) => session.data.users[user?.id || user?.username]?.coins || 0;

app.use('/midia', express.static(media.dir, { fallthrough: false }));
app.use('/tts-audio', express.static(tts.dir, { fallthrough: false }));
const recent = [];
const RECENT_MAX = 50;

app.get('/api/status', (_req, res) => {
  res.json({ status: live.status, config: publicConfig(), overlays: OVERLAYS, port: PORT, version: VERSION, dataDir: DATA_DIR, packaged: PACKAGED });
});

// ---------- configurações gerais ----------
// username: o @ da live (fica salvo até você trocar)
// autoConnect: conectar sozinho quando o app abre · autoRetry: esperar a live começar / reconectar se cair

app.get('/api/config', (_req, res) => res.json(publicConfig()));
app.put('/api/config', (req, res) => {
  const b = req.body || {};
  const patch = {};
  if ('username' in b) patch.username = String(b.username || '').replace(/^@/, '').trim().slice(0, 60);
  if ('autoConnect' in b) patch.autoConnect = !!b.autoConnect;
  if ('autoRetry' in b) patch.autoRetry = !!b.autoRetry;
  config = saveConfig(patch);
  live.autoRetry = publicConfig().autoRetry;
  res.json(publicConfig());
});

app.post('/api/abrir-pasta', (_req, res) => { openFolder(DATA_DIR); res.json({ ok: true }); });

// Atalhos na área de trabalho, no menu Iniciar e pra abrir junto com o Windows (só no .exe).
app.get('/api/atalhos', (_req, res) => res.json({
  supported: shortcutsSupported(),
  desktop: shortcutExists('desktop'), menu: shortcutExists('menu'), iniciar: shortcutExists('iniciar'),
}));
app.post('/api/atalhos', (req, res) => {
  try { setShortcut(String(req.body?.onde), !!req.body?.ativo); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// Fecha o app (o .exe não tem janela preta pra fechar).
app.post('/api/sair', (_req, res) => {
  res.json({ ok: true });
  setTimeout(shutdown, 300);
});

// ---------- backup das configurações ----------
// Ações, metas, roletas, TTS, ranking mensal e o @. As mídias ficam em data/midia (copie a pasta).
const BACKUP_FILES = ['config.json', 'acoes.json', 'metas.json', 'roletas.json', 'tts.json', 'mensal.json', 'gifts.json', 'spotify.json'];
app.get('/api/backup', (_req, res) => {
  const files = {};
  for (const f of BACKUP_FILES) {
    try { files[f] = JSON.parse(readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { /* não existe ainda */ }
  }
  res.setHeader('Content-Disposition', `attachment; filename="tiksoda-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ app: 'TikSoda', version: VERSION, savedAt: new Date().toISOString(), files });
});
app.post('/api/backup', express.json({ limit: '50mb' }), (req, res) => {
  const files = req.body?.files;
  if (req.body?.app !== 'TikSoda' || !files || typeof files !== 'object') return res.status(400).json({ error: 'Esse arquivo não é um backup do TikSoda.' });
  const restored = [];
  for (const f of BACKUP_FILES) {
    if (!files[f] || typeof files[f] !== 'object') continue;
    writeFileSync(path.join(DATA_DIR, f), JSON.stringify(files[f], null, 2));
    restored.push(f);
  }
  // Recarrega o que está em memória.
  config = loadConfig();
  actions.store.data = actions.store.load();
  goals.store.data = goals.store.load();
  wheels.store.data = wheels.store.load();
  tts.store.data = { ...tts.store.load() };
  tts.update({});
  spotify.store.data = { ...spotify.store.load() };
  spotify.update({});
  gifts.store.data = gifts.store.load();
  monthly.store.data = monthly.store.load();
  monthly.changed = true;
  broadcast({ kind: 'goals', goals: goals.publicList() });
  broadcast({ kind: 'wheels', wheels: wheels.list() });
  res.json({ ok: true, restored });
});

app.post('/api/connect', async (req, res) => {
  const username = String(req.body?.username || '').replace(/^@/, '').trim();
  if (!username) return res.status(400).json({ error: 'Informe o @ da live.' });
  config = saveConfig({ username });
  // Responde logo; o resultado chega pelo WebSocket como 'status'.
  res.json({ ok: true });
  live.connect(username).catch((err) => console.error(err));
});

app.post('/api/disconnect', async (_req, res) => {
  await live.disconnect();
  res.json({ ok: true });
});

app.get('/api/rankings', (_req, res) => res.json(session.rankings()));

app.post('/api/rankings/reset', (_req, res) => {
  session.reset(live.status.roomId || '');
  res.json({ ok: true });
});

// ---------- ranking mensal ----------
// Conta só quando você está conectado na SUA live (o @ salvo em "myUsername").
const isMyLive = () => !!config.myUsername && live.status.state === 'conectado'
  && live.status.username.toLowerCase() === config.myUsername.toLowerCase();

app.get('/api/mensal', (_req, res) => res.json({ ...monthly.rankings(), history: monthly.history(), myUsername: config.myUsername || '' }));

app.post('/api/mensal/reset', (_req, res) => {
  monthly.reset();
  res.json({ ok: true });
});

app.post('/api/mensal/meu-usuario', (req, res) => {
  const myUsername = String(req.body?.username || '').replace(/^@/, '').trim();
  config = saveConfig({ myUsername });
  res.json({ ok: true, myUsername });
});

// ---------- metas de presente ----------
app.get('/api/metas', (_req, res) => res.json(goals.publicList()));
const goalRoute = (fn) => (req, res) => {
  try { res.json(fn(req) ?? { ok: true }); } catch (err) { res.status(400).json({ error: err.message }); }
};
app.post('/api/metas', goalRoute((req) => goals.publicGoal(goals.create(req.body))));
app.put('/api/metas/:id', goalRoute((req) => goals.publicGoal(goals.update(req.params.id, req.body))));
app.delete('/api/metas/:id', goalRoute((req) => { goals.remove(req.params.id); }));
app.post('/api/metas/:id/zerar', goalRoute((req) => goals.publicGoal(goals.reset(req.params.id))));
app.post('/api/metas/:id/ajustar', goalRoute((req) => goals.publicGoal(goals.adjust(req.params.id, req.body?.amount))));

// ---------- presentes, mídia e ações ----------
app.get('/api/gifts', (_req, res) => res.json(gifts.list()));

// Baixa a lista oficial de presentes do TikTok. Usa a live conectada,
// ou o @ informado (precisa ser alguém que esteja ao vivo agora).
let importing = null;
app.post('/api/gifts/atualizar', async (req, res) => {
  const username = String(req.body?.username || '').trim()
    || (live.status.state === 'conectado' ? live.status.username : '');
  if (!username) return res.json({ needUser: true });
  try {
    importing ??= importTikTokGifts(username).finally(() => { importing = null; });
    const { gifts: list, method, raw } = await importing;
    try { writeFileSync(path.join(DATA_DIR, 'gifts-raw.json'), JSON.stringify({ savedAt: new Date().toISOString(), method, responses: raw })); } catch { /* só diagnóstico */ }
    res.json({ ok: true, method, found: list.length, ...gifts.importMany(list) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/midia', (_req, res) => res.json(media.list()));

app.post('/api/midia', express.raw({ type: () => true, limit: '300mb' }), (req, res) => {
  try {
    const name = decodeURIComponent(String(req.get('x-filename') || ''));
    if (!req.body?.length) throw new Error('Arquivo vazio.');
    res.json(media.save(name, req.body));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/midia/:file', (req, res) => {
  const f = req.params.file;
  const usedBy = actions.list().some((r) => r.media.file === f) ? 'numa ação'
    : goals.list().some((g) => g.media?.file === f) ? 'numa meta'
      : wheels.list().some((w) => w.options.some((o) => o.media?.file === f)) ? 'numa roleta' : '';
  if (usedBy) return res.status(400).json({ error: `Essa mídia está sendo usada ${usedBy}. Troque ou apague antes.` });
  try { media.remove(req.params.file); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/acoes', (_req, res) => res.json(actions.list()));

app.post('/api/acoes', (req, res) => {
  try { res.json(actions.create(req.body)); } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/acoes/:id', (req, res) => {
  try { res.json(actions.update(req.params.id, req.body)); } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/acoes/:id', (req, res) => {
  actions.remove(req.params.id);
  res.json({ ok: true });
});

app.post('/api/acoes/:id/testar', (req, res) => {
  const rule = actions.list().find((r) => r.id === req.params.id);
  if (!rule) return res.status(404).json({ error: 'Regra não encontrada.' });
  const extra = rule.trigger.repeat === 'cortar' ? { cut: true, times: 1 } : {};
  broadcast({ kind: 'play', play: actions.play(rule, null, 'teste', extra) });
  res.json({ ok: true });
});

// Toca uma mídia avulsa da biblioteca (botão de ouvir no painel).
app.post('/api/midia/:file/tocar', (req, res) => {
  if (!media.exists(req.params.file)) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  const fake = { id: 'teste', media: { file: req.params.file, volume: 100 }, name: req.params.file };
  broadcast({ kind: 'play', play: actions.play(fake, null, 'teste') });
  res.json({ ok: true });
});

// ---------- TTS ----------
app.get('/api/tts', (_req, res) => res.json({ config: tts.config, windows: tts.isWindows }));
app.put('/api/tts', (req, res) => {
  try { res.json({ config: tts.update(req.body) }); } catch (err) { res.status(400).json({ error: err.message }); }
});
app.get('/api/tts/vozes', async (_req, res) => {
  try { res.json(await tts.voices()); } catch (err) { res.status(500).json({ error: `Não consegui listar as vozes do Windows: ${err.message}` }); }
});
app.post('/api/tts/testar', (req, res) => {
  const text = String(req.body?.text || '').trim() || 'Olá! Este é um teste da voz do TikSoda.';
  res.json(tts.say(text, null));
});
app.post('/api/tts/:acao(pular|limpar)', (req, res) => {
  broadcast({ kind: 'tts-control', action: req.params.acao });
  res.json({ ok: true });
});

// ---------- roletas ----------
const wheelPublic = (w) => ({ ...w, history: wheels.recent(w.id) });
app.get('/api/roletas', (_req, res) => res.json(wheels.list().map(wheelPublic)));
app.post('/api/roletas', goalRoute((req) => wheels.create(req.body)));
app.put('/api/roletas/:id', goalRoute((req) => wheels.update(req.params.id, req.body)));
app.delete('/api/roletas/:id', goalRoute((req) => { wheels.remove(req.params.id); }));
app.post('/api/roletas/:id/girar', goalRoute((req) => {
  const spin = wheels.spin(req.params.id, null, 'painel');
  if (!spin) throw new Error('Fila cheia: espere os giros acabarem.');
  return spin;
}));

// ---------- Spotify (aba Música) ----------
app.get('/api/spotify', (_req, res) => res.json({ config: spotify.config, redirectUri: spotify.redirectUri, history: spotify.history, ...spotify.publicState() }));
app.put('/api/spotify', (req, res) => {
  const { clientId, ...rest } = req.body || {};
  try { res.json({ config: spotify.update(rest) }); } catch (err) { res.status(400).json({ error: err.message }); }
});
app.post('/api/spotify/client', (req, res) => res.json({ clientId: spotify.setClientId(req.body?.clientId) }));
app.get('/api/spotify/login', (_req, res) => {
  try { res.redirect(spotify.authUrl()); } catch (err) { res.status(400).send(err.message); }
});
app.get('/api/spotify/callback', async (req, res) => {
  const back = `http://localhost:${PORT}/painel/musica.html`;
  const page = (ok, msg) => res.send(`<!doctype html><meta charset="utf-8"><title>TikSoda · Spotify</title>
<body style="font:16px system-ui;background:#0f0f17;color:#eee;display:grid;place-items:center;height:100vh;margin:0;text-align:center">
<div><h2>${ok ? '✅ Spotify conectado!' : '❌ Não deu certo'}</h2><p>${msg}</p><p><a style="color:#ff4f8b" href="${back}">Voltar ao painel</a></p></div>
${ok ? `<script>setTimeout(()=>location.href=${JSON.stringify(back)},1500)</script>` : ''}</body>`);
  if (req.query.error) return page(false, req.query.error === 'access_denied' ? 'Você cancelou o login.' : String(req.query.error).replace(/[<>&"]/g, ''));
  try { await spotify.callback(String(req.query.code || ''), String(req.query.state || '')); page(true, 'Voltando pro painel…'); }
  catch (err) { page(false, String(err.message).replace(/[<>&"]/g, '')); }
});
app.post('/api/spotify/sair', (_req, res) => { spotify.logout(); res.json({ ok: true }); });
app.post('/api/spotify/pedir', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Digite o nome de uma música.' });
  if (!spotify.connected) return res.status(400).json({ error: 'Conecte o Spotify primeiro.' });
  res.json(await spotify.request(text));
});
app.post('/api/spotify/limpar-pedidos', (_req, res) => { spotify.clearRequests(); res.json({ ok: true }); });
app.post('/api/spotify/:acao(tocar|pausar|proxima|anterior)', async (req, res) => {
  try { await spotify.control(req.params.acao); res.json({ ok: true }); } catch (err) { res.status(400).json({ error: err.message }); }
});

// ---------- testes ----------
app.post('/api/test/combo', (_req, res) => {
  simulateCombo(publish);
  res.json({ ok: true });
});

app.post('/api/test/:type', (req, res) => {
  try {
    publish(simulate(req.params.type, req.body || {}));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- WebSocket para painel e overlays ----------
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(msg) {
  const text = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(text);
  }
}

function publish(event) {
  // Atualiza rankings; follow repetido da mesma pessoa não vira alerta de novo.
  const likesBefore = session.data.totals.likes;
  if (!session.record(event)) return;
  gifts.learn(event);
  goals.handle(event);
  tts.handle(event, coinsOf);
  wheels.handle(event, coinsOf);
  spotify.handle(event, coinsOf);
  if (isMyLive() && !event.simulated) monthly.record(event);
  for (const play of actions.match(event, likesBefore, session.data.totals.likes)) {
    broadcast({ kind: 'play', play });
  }
  // Durante um combo o presente chega várias vezes; guarda só o final no histórico.
  if (!event.streaking && event.type !== 'like' && event.type !== 'member') {
    recent.push(event);
    if (recent.length > RECENT_MAX) recent.shift();
  }
  broadcast({ kind: 'event', event });
}

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({
    kind: 'hello', status: live.status, recent,
    rankings: session.rankings(), monthly: monthly.rankings(), goals: goals.publicList(), wheels: wheels.list(), music: spotify.publicState(),
  }));
});

live.on('event', publish);
live.on('status', (status) => {
  // Pico de espectadores da live.
  const t = session.data.totals;
  if (status.state === 'conectado' && (status.viewers || 0) > (t.peakViewers || 0)) { t.peakViewers = status.viewers; session.touch(); }
  if (status.state === 'conectado') {
    const newLive = status.roomId && session.data.roomId !== status.roomId;
    session.ensureRoom(status.roomId);
    if (newLive) goals.resetForNewLive();
    // Primeira conexão bem-sucedida: assume que é a sua live (dá pra trocar no painel).
    if (!config.myUsername) config = saveConfig({ myUsername: status.username });
  }
  broadcast({ kind: 'status', status });
});
session.on('rankings', (rankings) => broadcast({ kind: 'rankings', rankings }));
monthly.on('rankings', (rankings) => broadcast({ kind: 'monthly', rankings }));
goals.on('change', () => broadcast({ kind: 'goals', goals: goals.publicList() }));
tts.on('speak', (item) => broadcast({ kind: 'tts', item }));
tts.on('log', (log) => broadcast({ kind: 'tts-log', log: { ...log, at: Date.now() } }));
spotify.on('state', (music) => broadcast({ kind: 'music', music }));
spotify.on('request', (request) => broadcast({ kind: 'music-request', request }));
spotify.on('log', (log) => broadcast({ kind: 'music-log', log }));
wheels.on('change', (list) => broadcast({ kind: 'wheels', wheels: list }));
wheels.on('spin', (spin, option, w) => {
  broadcast({ kind: 'wheel-spin', spin });
  if (option.media) {
    // Toca a mídia da opção quando a roleta parar.
    const fake = { id: `roleta-${w.id}`, media: option.media, name: `${w.name || 'Roleta'}: ${option.label}` };
    setTimeout(() => broadcast({ kind: 'play', play: actions.play(fake, spin.user, `roleta: ${option.label}`) }), Math.max(0, spin.startAt + spin.spinMs - Date.now()));
  }
});
goals.on('complete', (g) => {
  broadcast({ kind: 'goal-complete', goal: goals.publicGoal(g) });
  if (g.media) {
    const fake = { id: `meta-${g.id}`, media: g.media, name: g.name || `Meta ${g.giftName}` };
    broadcast({ kind: 'play', play: actions.play(fake, null, 'meta batida') });
  }
});

function shutdown() {
  session.flush(); monthly.flush();
  try { goals.store.save(); } catch { /* sem disco */ }
  live.disconnect().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const PANEL_URL = `http://localhost:${PORT}/painel/`;

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log(`  TikSoda ${VERSION} rodando!`);
  console.log(`  Painel: ${PANEL_URL}`);
  console.log(`  Dados: ${DATA_DIR}`);
  console.log('  Deixe esta janela aberta durante a live.');
  console.log('');
  if (OPEN_PANEL) openPanel(PANEL_URL);
  // Conecta sozinho no @ salvo.
  const cfg = publicConfig();
  if (cfg.autoConnect && cfg.username) live.connect(cfg.username).catch((err) => console.error(err));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Já tem um TikSoda aberto? Então só mostra o painel dele.
    http.get(`http://127.0.0.1:${PORT}/api/status`, (res) => {
      if (res.statusCode === 200) {
        if (OPEN_PANEL) openPanel(PANEL_URL);
        console.log('O TikSoda já está aberto.');
        setTimeout(() => process.exit(0), 1500);
      } else {
        console.error(`A porta ${PORT} está sendo usada por outro programa.`);
        process.exit(1);
      }
      res.resume();
    }).on('error', () => {
      console.error(`A porta ${PORT} está sendo usada por outro programa.`);
      process.exit(1);
    });
    return;
  }
  throw err;
});
