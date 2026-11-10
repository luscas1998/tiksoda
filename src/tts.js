import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { JsonStore } from './store.js';

// TTS: lê comentários do chat em voz alta no overlay /overlay/tts.
//
// Vozes:
//   'windows'   o app gera o áudio com as vozes instaladas no Windows (funciona
//               em qualquer lugar, inclusive no LIVE Studio)
//   'navegador' o próprio overlay fala (voz do navegador; pode não ter som em
//               alguns programas de live)

const DEFAULTS = {
  enabled: true,
  mode: 'comando',            // 'comando' (só quem usa o comando) ou 'todos' (todo comentário)
  command: '!falar',
  who: 'todos',               // 'todos' ou 'presente' (só quem já mandou presente nesta live)
  minCoins: 1,
  template: '{nome} disse: {mensagem}',
  maxChars: 100,
  cooldown: 10,               // segundos entre leituras da mesma pessoa
  maxQueue: 5,
  filterBad: true,
  ignoreLinks: true,
  blockedWords: '',
  ignoredUsers: '',
  engine: 'windows',
  voice: '',
  rate: 0,                    // -10 a 10
  volume: 100,
};

// Lista curta de palavrões comuns. Dá pra completar no painel.
const BAD_WORDS = [
  'porra', 'caralho', 'krl', 'puta', 'puto', 'merda', 'buceta', 'boceta', 'foda', 'fodase', 'fdp', 'cu', 'cuzao',
  'arrombado', 'arrombada', 'viado', 'cacete', 'piroca', 'pica', 'rola', 'xoxota', 'vadia', 'vagabunda', 'desgraca',
  'desgracado', 'otario', 'babaca', 'retardado', 'corno', 'punheta', 'siririca', 'bosta', 'pqp', 'vsf', 'tnc', 'vtnc',
];

const clamp = (n, min, max, def) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
};
const plain = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (s) => plain(s).split(/[^a-z0-9]+/).filter(Boolean);
const list = (s) => String(s || '').split(/[,\n]/).map((w) => plain(w).replace(/^@/, '').trim()).filter(Boolean);

export class TextToSpeech extends EventEmitter {
  constructor(dataDir) {
    super();
    this.store = new JsonStore(dataDir, 'tts.json', DEFAULTS);
    this.store.data = { ...DEFAULTS, ...this.store.data };
    this.dir = path.join(dataDir, 'tts');
    this.lastByUser = new Map();
    this.chain = Promise.resolve();
    this.pending = 0;
    this.seq = 0;
    this.isWindows = process.platform === 'win32';
  }

  get config() { return this.store.data; }

  update(input = {}) {
    const c = { ...this.config, ...input };
    this.store.data = {
      enabled: c.enabled !== false,
      mode: c.mode === 'todos' ? 'todos' : 'comando',
      command: String(c.command || '').trim().split(/\s+/)[0].slice(0, 30).toLowerCase() || '!falar',
      who: c.who === 'presente' ? 'presente' : 'todos',
      minCoins: clamp(c.minCoins, 1, 1_000_000, 1),
      template: String(c.template ?? DEFAULTS.template).slice(0, 120) || '{mensagem}',
      maxChars: clamp(c.maxChars, 10, 300, 100),
      cooldown: clamp(c.cooldown, 0, 3600, 10),
      maxQueue: clamp(c.maxQueue, 1, 50, 5),
      filterBad: c.filterBad !== false,
      ignoreLinks: c.ignoreLinks !== false,
      blockedWords: String(c.blockedWords || '').slice(0, 2000),
      ignoredUsers: String(c.ignoredUsers || '').slice(0, 2000),
      engine: c.engine === 'navegador' ? 'navegador' : 'windows',
      voice: String(c.voice || '').slice(0, 200),
      rate: clamp(c.rate, -10, 10, 0),
      volume: clamp(c.volume, 0, 100, 100),
    };
    this.store.save();
    return this.config;
  }

  // Recebe um comentário; devolve { ok } ou { ok: false, reason } (pro log do painel).
  handle(ev, coinsOf) {
    const c = this.config;
    if (ev.type !== 'chat' || !c.enabled) return null;
    let text = String(ev.comment || '').trim();
    if (c.mode === 'comando') {
      const [first] = text.split(/\s+/);
      if (first.toLowerCase() !== c.command) return null;
      text = text.slice(first.length).trim();
      if (!text) return null;
    }
    const skip = (reason) => {
      const r = { ok: false, user: ev.user, text, reason };
      this.emit('log', r);
      return r;
    };
    const who = plain(ev.user?.username);
    if (list(c.ignoredUsers).includes(who)) return skip('usuário ignorado');
    if (c.who === 'presente' && coinsOf(ev.user) < c.minCoins) return skip(`ainda não mandou ${c.minCoins} coin(s) nesta live`);
    if (c.ignoreLinks && /(https?:\/\/|www\.|\.(com|net|br|gg|ly|io)\b)/i.test(text)) return skip('tem link');
    if (c.filterBad || c.blockedWords) {
      const bad = new Set([...(c.filterBad ? BAD_WORDS : []), ...list(c.blockedWords)]);
      const flat = plain(text);
      const hit = words(text).some((w) => bad.has(w)) || list(c.blockedWords).some((w) => w.includes(' ') && flat.includes(w));
      if (hit) return skip('palavra bloqueada');
    }
    const key = ev.user?.id || who;
    const now = Date.now();
    if (c.cooldown && !ev.simulated && now - (this.lastByUser.get(key) || 0) < c.cooldown * 1000) return skip('esperando o tempo entre leituras');
    if (this.pending >= c.maxQueue) return skip('fila cheia');
    this.lastByUser.set(key, now);
    if (this.lastByUser.size > 2000) this.lastByUser.clear();
    return this.say(text, ev.user);
  }

  clean(text) {
    return String(text)
      .replace(/(.)\1{3,}/g, '$1$1$1') // kkkkkkkk -> kkk
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, this.config.maxChars);
  }

  say(text, user = null) {
    const c = this.config;
    const msg = this.clean(text);
    if (!msg) return { ok: false, reason: 'mensagem vazia' };
    const nome = user?.nickname || user?.username || '';
    const speak = (user ? c.template : '{mensagem}')
      .replaceAll('{nome}', nome)
      .replaceAll('{usuario}', user?.username || '')
      .replaceAll('{mensagem}', msg);
    const item = {
      id: `tts-${Date.now()}-${++this.seq}`,
      user, text: msg, speak,
      engine: c.engine, voice: c.voice, rate: c.rate, volume: c.volume,
      url: null,
    };
    this.pending++;
    this.chain = this.chain.then(async () => {
      if (c.engine === 'windows' && this.isWindows) {
        try { item.url = await this.render(item); }
        catch (err) {
          console.error('TTS do Windows falhou, usando a voz do navegador:', err.message);
          item.engine = 'navegador';
        }
      } else if (c.engine === 'windows') {
        item.engine = 'navegador'; // fora do Windows não há SAPI
      }
      this.emit('speak', item);
      this.emit('log', { ok: true, user, text: msg });
    }).finally(() => { this.pending = Math.max(0, this.pending - 1); });
    return { ok: true, id: item.id };
  }

  ensureDir() {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    // Apaga áudios com mais de 10 minutos.
    for (const f of readdirSync(this.dir)) {
      const p = path.join(this.dir, f);
      try { if (Date.now() - statSync(p).mtimeMs > 600_000) unlinkSync(p); } catch { /* em uso */ }
    }
  }

  // Gera um .wav com a voz do Windows (System.Speech). O texto vai por variável
  // de ambiente, nunca dentro do comando.
  render(item) {
    this.ensureDir();
    const file = `${item.id}.wav`;
    const out = path.join(this.dir, file);
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      'if ($env:TIKSODA_VOICE) { try { $s.SelectVoice($env:TIKSODA_VOICE) } catch {} }',
      '$s.Rate = [int]$env:TIKSODA_RATE',
      '$s.Volume = 100',
      '$s.SetOutputToWaveFile($env:TIKSODA_OUT)',
      '$s.Speak($env:TIKSODA_TEXT)',
      '$s.Dispose()',
    ].join('; ');
    return this.powershell(script, {
      TIKSODA_TEXT: item.speak, TIKSODA_VOICE: item.voice, TIKSODA_RATE: String(item.rate), TIKSODA_OUT: out,
    }).then(() => `/tts-audio/${encodeURIComponent(file)}`);
  }

  async voices() {
    if (!this.isWindows) return [];
    const script = 'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; '
      + '$s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name + "|" + $_.VoiceInfo.Culture.Name }';
    const out = await this.powershell(script, {});
    return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, lang] = l.split('|');
      return { name, lang: lang || '' };
    });
  }

  powershell(script, env) {
    return new Promise((resolve, reject) => {
      const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        env: { ...process.env, ...env }, windowsHide: true,
      });
      let out = '', err = '';
      p.stdout.on('data', (d) => { out += d; });
      p.stderr.on('data', (d) => { err += d; });
      const timer = setTimeout(() => { p.kill(); reject(new Error('demorou demais')); }, 20000);
      p.on('error', (e) => { clearTimeout(timer); reject(e); });
      p.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out); else reject(new Error(err.trim() || `saiu com código ${code}`));
      });
    });
  }
}
