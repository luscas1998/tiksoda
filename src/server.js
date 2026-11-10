import express from 'express';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PORT = Number(process.env.PORT) || 3330;

// ---------- configuração salva em disco ----------
function loadConfig() {
  try { return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
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
let config = loadConfig();

// Quantos coins a pessoa já mandou nesta live (pra regras "só quem mandou presente").
const coinsOf = (user) => session.data.users[user?.id || user?.username]?.coins || 0;

app.use('/midia', express.static(media.dir, { fallthrough: false }));
app.use('/tts-audio', express.static(tts.dir, { fallthrough: false }));
const recent = [];
const RECENT_MAX = 50;

app.get('/api/status', (_req, res) => {
  res.json({ status: live.status, config: loadConfig(), overlays: OVERLAYS, port: PORT });
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
    rankings: session.rankings(), monthly: monthly.rankings(), goals: goals.publicList(), wheels: wheels.list(),
  }));
});

live.on('event', publish);
live.on('status', (status) => {
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

const shutdown = () => { session.flush(); monthly.flush(); try { goals.store.save(); } catch {} process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  TikSoda rodando!');
  console.log(`  Painel: http://localhost:${PORT}/painel/`);
  console.log('  Deixe esta janela aberta durante a live.');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`A porta ${PORT} já está em uso. O TikSoda já está aberto em outra janela?`);
    process.exit(1);
  }
  throw err;
});
