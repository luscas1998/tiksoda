import express from 'express';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { LiveManager } from './live.js';
import { simulate } from './simulate.js';
import { OVERLAYS } from './overlays.js';
import { Session } from './session.js';

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

app.get('/overlay/:slug', (req, res) => {
  const ov = OVERLAYS.find((o) => o.slug === req.params.slug && o.ready);
  if (!ov) return res.status(404).send('Overlay não encontrado.');
  res.sendFile(path.join(ROOT, 'public/overlay', `${ov.file || ov.slug}.html`));
});

const live = new LiveManager();
const session = new Session(DATA_DIR);
const recent = [];
const RECENT_MAX = 50;

app.get('/api/status', (_req, res) => {
  res.json({ status: live.status, config: loadConfig(), overlays: OVERLAYS, port: PORT });
});

app.post('/api/connect', async (req, res) => {
  const username = String(req.body?.username || '').replace(/^@/, '').trim();
  if (!username) return res.status(400).json({ error: 'Informe o @ da live.' });
  saveConfig({ username });
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

app.post('/api/test/:type', (req, res) => {
  try {
    publish(simulate(req.params.type));
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
  if (!session.record(event)) return;
  // Durante um combo o presente chega várias vezes; guarda só o final no histórico.
  if (!event.streaking && event.type !== 'like' && event.type !== 'member') {
    recent.push(event);
    if (recent.length > RECENT_MAX) recent.shift();
  }
  broadcast({ kind: 'event', event });
}

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ kind: 'hello', status: live.status, recent, rankings: session.rankings() }));
});

live.on('event', publish);
live.on('status', (status) => {
  if (status.state === 'conectado') session.ensureRoom(status.roomId);
  broadcast({ kind: 'status', status });
});
session.on('rankings', (rankings) => broadcast({ kind: 'rankings', rankings }));

const shutdown = () => { session.flush(); process.exit(0); };
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
