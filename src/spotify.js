import { EventEmitter } from 'node:events';
import { randomBytes, createHash } from 'node:crypto';
import { JsonStore } from './store.js';

// Spotify: o chat pede música (!musica nome), pula por votação (!pular) e o
// overlay /overlay/musica mostra o que está tocando.
//
// Usa a API oficial do Spotify com o login da própria conta (PKCE, sem senha
// guardada no app). Pôr música na fila e pular só funciona com Premium.
// O login fica salvo em spotify-login.json (fora do backup, de propósito).

const API = 'https://api.spotify.com/v1';
const ACCOUNTS = 'https://accounts.spotify.com';
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state user-read-private';

// Quem pode: 'todos' libera geral; senão basta a pessoa ser de um dos grupos marcados.
export const WHO = ['todos', 'seguidor', 'amigo', 'fa', 'assinante', 'moderador', 'presente'];
const WHO_LABEL = {
  seguidor: 'seguidores', amigo: 'amigos', fa: 'fã-clube (Heart Me)', assinante: 'assinantes', moderador: 'moderadores', presente: 'quem mandou presente',
};

const DEFAULTS = {
  clientId: '',
  enabled: true,
  command: '!musica',
  who: ['todos'],
  minCoins: 1,
  cooldown: 120,           // segundos entre pedidos da mesma pessoa
  maxPerUser: 2,           // pedidos da mesma pessoa esperando na fila
  maxQueue: 10,            // pedidos esperando no total
  maxMinutes: 8,           // música mais longa que isso não entra
  playMode: 'agora',       // 'agora': pedido corta a música da playlist e toca na hora · 'fila': espera a atual acabar
  blockExplicit: false,
  blockedWords: '',
  ignoredUsers: '',
  skipEnabled: true,
  skipCommand: '!pular',
  skipWho: ['todos'],
  skipVotes: 3,            // votos pra pular (1 = pula na hora)
  modsSkip: true,          // moderador pula direto, sem votação
  onlyRequestedSkip: false, // !pular só vale em música pedida pelo chat
};

const clamp = (n, min, max, def) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
};
const plain = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const list = (s) => String(s || '').split(/[,\n]/).map((w) => plain(w).replace(/^@/, '').trim()).filter(Boolean);
const cmd = (s, def) => String(s || '').trim().split(/\s+/)[0].slice(0, 30).toLowerCase() || def;
const whoList = (v) => {
  const arr = (Array.isArray(v) ? v : [v]).filter((x) => WHO.includes(x));
  return arr.length && !arr.includes('todos') ? arr : ['todos'];
};
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function trackOf(t) {
  if (!t) return null;
  return {
    id: t.id,
    uri: t.uri,
    name: t.name || '',
    artists: (t.artists || []).map((a) => a.name).join(', '),
    album: t.album?.name || '',
    image: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || '',
    durationMs: t.duration_ms || 0,
    explicit: !!t.explicit,
  };
}

export class Spotify extends EventEmitter {
  constructor(dataDir, port) {
    super();
    this.store = new JsonStore(dataDir, 'spotify.json', DEFAULTS);
    this.login = new JsonStore(dataDir, 'spotify-login.json', {});
    this.redirectUri = `http://127.0.0.1:${port}/api/spotify/callback`;
    this.access = null;           // { token, expiresAt }
    this.pkce = null;             // { verifier, state }
    this.account = null;          // { name, premium }
    this.now = null;              // o que está tocando
    this.pending = [];            // pedidos do chat esperando tocar
    this.votes = new Set();       // quem já votou pra pular a música atual
    this.lastByUser = new Map();
    this.chain = Promise.resolve();
    this.pollTimer = null;
    this.lastError = '';
    this.history = [];             // últimos pedidos e votos (pro painel)
    this.update({});
    if (this.connected) this.startPolling();
  }

  get config() { return this.store.data; }
  // Login feito com uma versão antiga (sem todas as permissões): precisa conectar de novo.
  get needsReconnect() {
    const granted = this.login.data.scope;
    return this.connected && (granted === '' || (!!granted && SCOPES.split(' ').some((x) => !granted.split(' ').includes(x))));
  }

  get connected() { return !!(this.config.clientId && this.login.data.refreshToken); }

  update(input = {}) {
    const c = { ...DEFAULTS, ...this.store.data, ...input };
    this.store.data = {
      clientId: String(c.clientId || '').trim().replace(/[^a-zA-Z0-9]/g, '').slice(0, 64),
      enabled: c.enabled !== false,
      command: cmd(c.command, '!musica'),
      who: whoList(c.who),
      minCoins: clamp(c.minCoins, 1, 1_000_000, 1),
      cooldown: clamp(c.cooldown, 0, 3600, 120),
      maxPerUser: clamp(c.maxPerUser, 1, 20, 2),
      maxQueue: clamp(c.maxQueue, 1, 50, 10),
      maxMinutes: clamp(c.maxMinutes, 1, 60, 8),
      blockExplicit: !!c.blockExplicit,
      blockedWords: String(c.blockedWords || '').slice(0, 2000),
      ignoredUsers: String(c.ignoredUsers || '').slice(0, 2000),
      skipEnabled: c.skipEnabled !== false,
      skipCommand: cmd(c.skipCommand, '!pular'),
      skipWho: whoList(c.skipWho),
      skipVotes: clamp(c.skipVotes, 1, 50, 3),
      modsSkip: c.modsSkip !== false,
      onlyRequestedSkip: !!c.onlyRequestedSkip,
      playMode: c.playMode === 'fila' ? 'fila' : 'agora',
    };
    this.store.save();
    this.emitState();
    return this.config;
  }

  publicState() {
    return {
      connected: this.connected,
      account: this.account,
      now: this.now,
      pending: this.pending,
      votes: { count: this.votes.size, needed: this.config.skipVotes },
      error: this.lastError,
      needsReconnect: this.needsReconnect,
    };
  }

  emitState() { this.emit('state', this.publicState()); }

  // ---------- login ----------
  setClientId(id) {
    const before = this.config.clientId;
    this.update({ clientId: id });
    if (before !== this.config.clientId) this.logout();
    return this.config.clientId;
  }

  authUrl() {
    if (!this.config.clientId) throw new Error('Cole o Client ID do seu app do Spotify primeiro.');
    const verifier = b64url(randomBytes(48));
    const state = b64url(randomBytes(12));
    this.pkce = { verifier, state };
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      scope: SCOPES,
      redirect_uri: this.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: b64url(createHash('sha256').update(verifier).digest()),
      state,
    });
    return `${ACCOUNTS}/authorize?${q}`;
  }

  async callback(code, state) {
    if (!this.pkce || state !== this.pkce.state) throw new Error('O login expirou. Clique em "Conectar Spotify" de novo.');
    const verifier = this.pkce.verifier;
    this.pkce = null;
    await this.token({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri, code_verifier: verifier });
    await this.loadAccount();
    this.startPolling();
  }

  logout() {
    this.login.data = {};
    this.login.save();
    this.access = null;
    this.account = null;
    this.now = null;
    this.stopPolling();
    this.emitState();
  }

  async token(params) {
    const res = await fetch(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.config.clientId, ...params }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.error === 'invalid_grant' && params.grant_type === 'refresh_token') {
        this.logout();
        throw new Error('O login do Spotify expirou. Conecte de novo na aba Música.');
      }
      if (data.error === 'invalid_client') throw new Error('Client ID inválido. Confira o que você copiou do site do Spotify.');
      throw new Error(data.error_description || data.error || `Spotify respondeu ${res.status}`);
    }
    this.access = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    if (data.refresh_token || data.scope) {
      this.login.data = { ...this.login.data, ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}), ...(data.scope ? { scope: data.scope } : {}) };
      this.login.save();
    }
  }

  async accessToken() {
    if (this.access && Date.now() < this.access.expiresAt) return this.access.token;
    if (!this.connected) throw new Error('Conecte o Spotify na aba Música.');
    if (!this.refreshing) {
      this.refreshing = this.token({ grant_type: 'refresh_token', refresh_token: this.login.data.refreshToken })
        .finally(() => { this.refreshing = null; });
    }
    await this.refreshing;
    return this.access.token;
  }

  async api(method, path, { query, body, retry = true } = {}) {
    const url = `${API}${path}${query ? `?${new URLSearchParams(query)}` : ''}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && retry) { this.access = null; return this.api(method, path, { query, body, retry: false }); }
    if (res.status === 429 && retry) {
      const wait = Math.min(30, Number(res.headers.get('retry-after')) || 2);
      await new Promise((r) => setTimeout(r, wait * 1000));
      return this.api(method, path, { query, body, retry: false });
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = data?.error?.reason || '';
      const msg = data?.error?.message || '';
      if (reason === 'NO_ACTIVE_DEVICE' || (res.status === 404 && /device/i.test(msg))) throw new Error('Nenhum Spotify tocando. Abra o Spotify no PC e dê play numa música.');
      if (reason === 'PREMIUM_REQUIRED') throw new Error('Pôr na fila e pular só funciona com Spotify Premium.');
      if (/scope/i.test(msg)) {
        this.login.data = { ...this.login.data, scope: '' };
        throw new Error('Falta permissão no login do Spotify. Na aba Música, clique em Desconectar e depois em Conectar Spotify de novo.');
      }
      if (res.status === 403) throw new Error(`O Spotify não deixou (${msg || 'sem permissão'}). Se o app do Spotify for novo, confira se o seu e-mail está em "User Management" no site de desenvolvedor.`);
      throw new Error(msg || `Spotify respondeu ${res.status}`);
    }
    return data;
  }

  async loadAccount() {
    try {
      const me = await this.api('GET', '/me');
      this.account = { name: me.display_name || me.id, premium: me.product === 'premium' };
    } catch (err) {
      this.account = null;
      this.lastError = err.message;
    }
    this.emitState();
  }

  // ---------- o que está tocando ----------
  startPolling() {
    this.stopPolling();
    const tick = async () => {
      let delay = 8000;
      try {
        if (!this.account) await this.loadAccount();
        delay = (await this.poll()) ? 3000 : 8000;
        if (this.lastError) { this.lastError = ''; this.emitState(); }
      } catch (err) {
        if (!this.connected) return;
        if (err.message !== this.lastError) { this.lastError = err.message; this.emitState(); }
        delay = 15000;
      }
      if (this.connected) this.pollTimer = setTimeout(tick, delay);
    };
    this.pollTimer = setTimeout(tick, 200);
  }

  stopPolling() { clearTimeout(this.pollTimer); this.pollTimer = null; }

  // Pergunta ao Spotify o que está tocando. Devolve true se está tocando (pra checar mais vezes).
  async poll() {
    const data = await this.api('GET', '/me/player/currently-playing', { query: { additional_types: 'track' } });
    const track = data?.item && data.currently_playing_type === 'track' ? trackOf(data.item) : null;
    const prev = this.now;
    if (!track) {
      if (prev) { this.now = null; this.emitState(); }
      return false;
    }
    const changed = !prev || prev.id !== track.id;
    if (changed) {
      this.votes.clear();
      // Era um pedido do chat? Marca quem pediu e tira da fila de espera.
      const i = this.pending.findIndex((p) => p.id === track.id);
      track.requestedBy = i >= 0 ? this.pending[i].user : null;
      if (i >= 0) this.pending.splice(i, 1);
      // Pedido que ficou pra trás (pulado no Spotify) some depois de 3 horas.
      const old = Date.now() - 3 * 3600_000;
      this.pending = this.pending.filter((p) => p.at > old);
    } else {
      track.requestedBy = prev.requestedBy;
    }
    const now = { ...track, isPlaying: !!data.is_playing, progressMs: data.progress_ms || 0, at: Date.now() };
    const expected = prev ? prev.progressMs + (prev.isPlaying ? now.at - prev.at : 0) : 0;
    const jump = Math.abs(expected - now.progressMs) > 2500;
    this.now = now;
    if (changed || jump || prev.isPlaying !== now.isPlaying) this.emitState();
    return now.isPlaying;
  }

  // ---------- controles do painel ----------
  async control(action) {
    const routes = {
      tocar: ['PUT', '/me/player/play'],
      pausar: ['PUT', '/me/player/pause'],
      proxima: ['POST', '/me/player/next'],
      anterior: ['POST', '/me/player/previous'],
    };
    const r = routes[action];
    if (!r) throw new Error('Ação desconhecida.');
    await this.api(r[0], r[1]);
    setTimeout(() => this.poll().catch(() => {}), 600);
  }

  clearRequests() { this.pending = []; this.emitState(); }

  // ---------- chat ----------
  allowed(user, who, coinsOf) {
    if (who.includes('todos')) return true;
    const r = user?.roles || {};
    return who.some((w) => (w === 'presente' ? coinsOf(user) >= this.config.minCoins : !!r[w]));
  }

  whoText(who) { return who.includes('todos') ? 'todos' : who.map((w) => WHO_LABEL[w]).join(' ou '); }

  log(entry) {
    const r = { at: Date.now(), ...entry };
    this.history.push(r);
    if (this.history.length > 40) this.history.shift();
    this.emit('log', r);
    return r;
  }

  handle(ev, coinsOf) {
    if (ev.type !== 'chat' || !this.connected) return null;
    const c = this.config;
    const text = String(ev.comment || '').trim();
    const [first] = text.split(/\s+/);
    const word = (first || '').toLowerCase();
    if (c.enabled && word === c.command) {
      const query = text.slice(first.length).trim();
      if (!query) return null;
      this.chain = this.chain.then(() => this.request(query, ev, coinsOf)).catch(() => {});
      return true;
    }
    if (c.skipEnabled && word === c.skipCommand) return this.voteSkip(ev, coinsOf);
    return null;
  }

  // Pedido de música (do chat ou do botão de teste do painel, que não tem user).
  async request(query, ev = null, coinsOf = () => 0) {
    const c = this.config;
    const user = ev?.user || null;
    const fail = (reason, track = null) => this.log({ ok: false, user, query, track, reason });
    if (user) {
      const who = plain(user.username);
      if (list(c.ignoredUsers).includes(who)) return fail('usuário ignorado');
      if (!this.allowed(user, c.who, coinsOf)) return fail(`só ${this.whoText(c.who)} podem pedir`);
      const key = user.id || who;
      const last = this.lastByUser.get(key) || 0;
      if (c.cooldown && !ev.simulated && Date.now() - last < c.cooldown * 1000) {
        return fail(`espere ${Math.ceil((c.cooldown * 1000 - (Date.now() - last)) / 1000)} s pra pedir de novo`);
      }
      if (this.pending.filter((p) => p.user && (p.user.id || p.user.username) === (user.id || user.username)).length >= c.maxPerUser) {
        return fail(`já tem ${c.maxPerUser} pedido(s) na fila`);
      }
    }
    if (this.pending.length >= c.maxQueue) return fail('fila de pedidos cheia');

    let track;
    try {
      const link = query.match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/);
      if (link) track = trackOf(await this.api('GET', `/tracks/${link[1]}`));
      else {
        const found = await this.api('GET', '/search', { query: { q: query.slice(0, 100), type: 'track', limit: '5' } });
        const items = (found?.tracks?.items || []).map(trackOf);
        // Prefere a primeira que passa nos filtros.
        track = items.find((t) => !this.blockReason(t)) || items[0];
      }
    } catch (err) { return fail(err.message); }
    if (!track) return fail('não achei essa música');
    const why = this.blockReason(track);
    if (why) return fail(why, track);
    if (this.now?.id === track.id) return fail('já está tocando', track);
    if (this.pending.some((p) => p.id === track.id)) return fail('já está na fila', track);

    // Modo "tocar na hora": se agora toca música da sua playlist (não um pedido) e não tem
    // outro pedido esperando, põe na fila e pula pra ela. Pedido nunca corta outro pedido.
    const playNow = c.playMode === 'agora' && !this.now?.requestedBy && this.pending.length === 0;
    try {
      await this.api('POST', '/me/player/queue', { query: { uri: track.uri } });
      if (playNow) {
        await new Promise((r) => setTimeout(r, 400));
        await this.api('POST', '/me/player/next');
        setTimeout(() => this.poll().catch(() => {}), 800);
      }
    } catch (err) { return fail(err.message, track); }

    if (user) {
      this.lastByUser.set(user.id || plain(user.username), Date.now());
      if (this.lastByUser.size > 2000) this.lastByUser.clear();
    }
    const req = { ...track, user, at: Date.now() };
    this.pending.push(req);
    this.emit('request', req);
    this.emitState();
    return this.log({ ok: true, user, query, track });
  }

  blockReason(t) {
    const c = this.config;
    if (c.blockExplicit && t.explicit) return 'música explícita (bloqueada)';
    if (t.durationMs > c.maxMinutes * 60_000) return `mais longa que ${c.maxMinutes} min`;
    const blocked = list(c.blockedWords);
    if (blocked.length) {
      const hay = plain(`${t.name} ${t.artists}`);
      if (blocked.some((w) => hay.includes(w))) return 'artista ou palavra bloqueada';
    }
    return '';
  }

  voteSkip(ev, coinsOf) {
    const c = this.config;
    const user = ev.user;
    const fail = (reason) => this.log({ ok: false, skip: true, user, reason });
    if (!this.now) return fail('nada tocando');
    if (list(c.ignoredUsers).includes(plain(user?.username))) return fail('usuário ignorado');
    const mod = c.modsSkip && user?.roles?.moderador;
    if (!mod && !this.allowed(user, c.skipWho, coinsOf)) return fail(`só ${this.whoText(c.skipWho)} podem pular`);
    if (!mod && c.onlyRequestedSkip && !this.now.requestedBy) return fail('só dá pra pular música pedida pelo chat');
    const voter = user?.id || user?.username || ev.id;
    if (!mod && this.votes.has(voter)) return fail('já votou nesta música');
    this.votes.add(voter);
    const count = this.votes.size;
    if (mod || count >= c.skipVotes) {
      this.votes.clear();
      this.control('proxima').catch((err) => { this.lastError = err.message; this.emitState(); });
      this.emit('skipped', { user, byMod: !!mod });
      this.emitState();
      return this.log({ ok: true, skip: true, user, reason: mod ? 'moderador pulou' : `pulou com ${count} voto(s)` });
    }
    this.emitState();
    return this.log({ ok: true, skip: true, user, reason: `voto ${count}/${c.skipVotes}` });
  }
}
