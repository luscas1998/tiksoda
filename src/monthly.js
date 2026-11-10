import { EventEmitter } from 'node:events';
import { JsonStore } from './store.js';

// Ranking mensal de likes e coins.
// - Conta só as lives do seu @ (configurado no painel), e nunca os eventos de teste.
// - Zera sozinho na virada do mês e no botão do painel; o mês fechado vai pro histórico.
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const TOP_HISTORY = 20;

export class MonthlyRanking extends EventEmitter {
  constructor(dataDir) {
    super();
    this.store = new JsonStore(dataDir, 'mensal.json', { month: monthKey(), startedAt: Date.now(), users: {}, history: [] });
    this.dirty = false;
    this.changed = false;
    setInterval(() => this.flush(), 5000).unref();
    setInterval(() => {
      this.rollMonth();
      if (this.changed) { this.changed = false; this.emit('rankings', this.rankings()); }
    }, 1000).unref();
  }

  get data() { return this.store.data; }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try { this.store.save(); } catch (err) { console.error('Não consegui salvar o ranking mensal:', err.message); }
  }

  top(field, n, users = this.data.users) {
    return Object.values(users)
      .filter((u) => u[field] > 0)
      .sort((a, b) => b[field] - a[field])
      .slice(0, n)
      .map((u) => ({ username: u.username, nickname: u.nickname, avatar: u.avatar || '', value: u[field] }));
  }

  // Fecha o período atual: guarda o top no histórico e começa do zero.
  archive(label) {
    const d = this.data;
    if (Object.keys(d.users).length) {
      d.history.unshift({
        month: d.month, label, startedAt: d.startedAt, endedAt: Date.now(),
        likes: this.top('likes', TOP_HISTORY), coins: this.top('coins', TOP_HISTORY),
      });
      d.history = d.history.slice(0, 24);
    }
    d.users = {};
    d.month = monthKey();
    d.startedAt = Date.now();
    this.dirty = true;
    this.changed = true;
    this.flush();
  }

  rollMonth() {
    if (this.data.month !== monthKey()) this.archive('virada do mês');
  }

  reset() {
    this.archive('zerado no painel');
    this.emit('rankings', this.rankings());
  }

  record(ev) {
    if (ev.simulated || ev.streaking) return;
    if (ev.type !== 'like' && ev.type !== 'gift') return;
    this.rollMonth();
    const key = ev.user.id || ev.user.username;
    const u = this.data.users[key] || { likes: 0, coins: 0 };
    u.username = ev.user.username;
    u.nickname = ev.user.nickname;
    if (ev.user.avatar) u.avatar = ev.user.avatar;
    if (ev.type === 'like') u.likes += ev.likeCount;
    else u.coins += ev.totalCoins;
    this.data.users[key] = u;
    this.dirty = true;
    this.changed = true;
  }

  rankings() {
    const users = Object.values(this.data.users);
    return {
      month: this.data.month,
      startedAt: this.data.startedAt,
      likes: this.top('likes', 20),
      coins: this.top('coins', 20),
      totals: {
        likes: users.reduce((s, u) => s + u.likes, 0),
        coins: users.reduce((s, u) => s + u.coins, 0),
      },
    };
  }

  history() { return this.data.history; }
}
