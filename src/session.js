import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

// Guarda os totais da live atual (likes e coins por pessoa).
// Fica salvo em data/session.json, então fechar e abrir o app no meio
// da live não perde o ranking. Zera sozinho quando entra numa live nova
// (outra sala) ou quando você clica em "Zerar" no painel.
export class Session extends EventEmitter {
  constructor(dataDir) {
    super();
    this.file = path.join(dataDir, 'session.json');
    this.dataDir = dataDir;
    this.data = this.load();
    this.dirty = false;
    this.changed = false;
    setInterval(() => this.flush(), 5000).unref();
    // Avisa painel e overlays no máximo 2x por segundo.
    setInterval(() => {
      if (this.changed) { this.changed = false; this.emit('rankings', this.rankings()); }
    }, 500).unref();
  }

  empty(roomId = '') {
    return { roomId, startedAt: Date.now(), users: {}, followers: [], totals: { likes: 0, coins: 0, gifts: 0, follows: 0, shares: 0 } };
  }

  load() {
    try {
      const d = JSON.parse(readFileSync(this.file, 'utf8'));
      if (d && d.users && d.totals) return d;
    } catch { /* primeira vez */ }
    return this.empty();
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.data));
    } catch (err) { console.error('Não consegui salvar a sessão:', err.message); }
  }

  touch() { this.dirty = true; this.changed = true; }

  reset(roomId = '') {
    this.data = this.empty(roomId);
    this.touch();
    this.flush();
    this.emit('rankings', this.rankings());
  }

  // Chamado ao conectar: só zera se for uma live diferente da anterior.
  ensureRoom(roomId) {
    if (roomId && this.data.roomId !== roomId) this.reset(roomId);
  }

  user(u) {
    const key = u.id || u.username;
    const cur = this.data.users[key] || { likes: 0, coins: 0 };
    cur.username = u.username;
    cur.nickname = u.nickname;
    if (u.avatar) cur.avatar = u.avatar;
    this.data.users[key] = cur;
    return cur;
  }

  // Retorna false quando o evento é repetido e não deve virar alerta
  // (ex.: a mesma pessoa seguindo de novo na mesma live).
  record(ev) {
    const t = this.data.totals;
    switch (ev.type) {
      case 'like':
        this.user(ev.user).likes += ev.likeCount;
        t.likes += ev.likeCount;
        break;
      case 'gift':
        if (ev.streaking) return true;
        this.user(ev.user).coins += ev.totalCoins;
        t.coins += ev.totalCoins;
        t.gifts += ev.repeatCount;
        break;
      case 'follow': {
        const key = ev.user.id || ev.user.username;
        if (this.data.followers.includes(key)) return false;
        this.data.followers.push(key);
        t.follows += 1;
        break;
      }
      case 'share':
        t.shares += 1;
        break;
      default:
        return true;
    }
    this.touch();
    return true;
  }

  top(field, n = 10) {
    return Object.values(this.data.users)
      .filter((u) => u[field] > 0)
      .sort((a, b) => b[field] - a[field])
      .slice(0, n)
      .map((u) => ({ username: u.username, nickname: u.nickname, avatar: u.avatar || '', value: u[field] }));
  }

  rankings() {
    return { likes: this.top('likes', 20), coins: this.top('coins', 20), totals: this.data.totals, startedAt: this.data.startedAt };
  }
}
