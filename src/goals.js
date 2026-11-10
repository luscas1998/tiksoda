import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { JsonStore } from './store.js';

// Metas de presente: "quero receber 10 Rosas". Cada meta tem seu próprio
// overlay (/overlay/meta/<id>) com o presente pulsando e a contagem embaixo.
//
// Ao bater a meta (onComplete):
//   'recomecar'  comemora e começa de novo (o que passar da meta já conta pra próxima)
//   'manter'     comemora e fica "concluída" na tela até você zerar
//   'sumir'      comemora e some da tela até você zerar
//
// Emite 'change' (lista atualizada) e 'complete' (meta batida).
const ON_COMPLETE = new Set(['recomecar', 'manter', 'sumir']);

export class GiftGoals extends EventEmitter {
  constructor(dataDir, media) {
    super();
    this.store = new JsonStore(dataDir, 'metas.json', { goals: [] });
    this.media = media;
    this.combos = new Map();
    this.saveTimer = null;
    this.emitTimer = null;
  }

  list() { return this.store.data.goals; }
  get(id) { return this.store.data.goals.find((g) => g.id === id); }

  validate(input, current = {}) {
    const merged = { ...current, ...input };
    const giftId = String(merged.giftId || '').trim();
    const giftName = String(merged.giftName || '').trim();
    if (!giftId && !giftName) throw new Error('Escolha o presente.');
    const target = Math.floor(Number(merged.target));
    if (!(target >= 1)) throw new Error('A meta precisa ser de pelo menos 1.');
    let media = null;
    if (merged.media?.file) {
      if (!this.media.exists(merged.media.file)) throw new Error('Mídia não encontrada na biblioteca.');
      media = { file: merged.media.file, volume: Math.min(100, Math.max(0, Math.round(Number(merged.media.volume ?? 100)))) };
    }
    return {
      name: String(merged.name || '').trim().slice(0, 60),
      enabled: merged.enabled !== false,
      giftId,
      giftName,
      giftImage: String(merged.giftImage || ''),
      target,
      textTop: String(merged.textTop ?? '').slice(0, 120),
      textBottom: String(merged.textBottom ?? '{atual}/{meta}').slice(0, 120),
      onComplete: ON_COMPLETE.has(merged.onComplete) ? merged.onComplete : 'recomecar',
      showTop: merged.showTop !== false,
      media,
    };
  }

  create(input) {
    const goal = { id: randomUUID().slice(0, 8), ...this.validate(input), count: 0, completed: false, times: 0, helpers: {} };
    this.store.data.goals.push(goal);
    this.changed(true);
    return goal;
  }

  update(id, input) {
    const g = this.get(id);
    if (!g) throw new Error('Meta não encontrada.');
    Object.assign(g, this.validate(input, g));
    if (g.count < g.target) g.completed = false;
    this.changed(true);
    return g;
  }

  remove(id) {
    this.store.data.goals = this.store.data.goals.filter((g) => g.id !== id);
    this.changed(true);
  }

  reset(id) {
    const g = this.get(id);
    if (!g) throw new Error('Meta não encontrada.');
    Object.assign(g, { count: 0, completed: false, times: 0, helpers: {} });
    this.changed(true);
    return g;
  }

  // Ajuste manual (+1 / -1 no painel).
  adjust(id, amount) {
    const g = this.get(id);
    if (!g) throw new Error('Meta não encontrada.');
    this.add(g, Math.round(Number(amount) || 0), null);
    this.changed(true);
    return g;
  }

  changed(saveNow = false) {
    clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => this.emit('change', this.list()), 100);
    clearTimeout(this.saveTimer);
    if (saveNow) this.store.save();
    else this.saveTimer = setTimeout(() => this.store.save(), 2000);
  }

  // Quantos presentes novos chegaram (combos chegam em vários eventos).
  delta(ev) {
    const key = `${ev.user?.id}|${ev.giftId}|${ev.groupId}`;
    const before = this.combos.get(key) || 0;
    const d = Math.max(0, ev.repeatCount - before);
    if (ev.streaking) this.combos.set(key, ev.repeatCount);
    else this.combos.delete(key);
    if (this.combos.size > 500) this.combos.clear();
    return d;
  }

  add(g, n, user) {
    if (!n) return;
    if (g.completed && g.onComplete !== 'recomecar') return; // já concluída: espera zerar
    g.count = Math.max(0, g.count + n);
    if (user && n > 0) {
      const key = user.id || user.username;
      const h = g.helpers[key] || { nickname: user.nickname, avatar: user.avatar || '', count: 0 };
      h.count += n;
      h.nickname = user.nickname;
      if (user.avatar) h.avatar = user.avatar;
      g.helpers[key] = h;
    }
    while (g.count >= g.target && !(g.completed && g.onComplete !== 'recomecar')) {
      g.times += 1;
      if (g.onComplete === 'recomecar') {
        g.count -= g.target;
        g.helpers = {};
      } else {
        g.count = g.target;
        g.completed = true;
      }
      this.emit('complete', g);
      if (g.onComplete !== 'recomecar') break;
    }
  }

  handle(ev) {
    if (ev.type !== 'gift') return;
    const n = this.delta(ev);
    if (!n) return;
    let touched = false;
    for (const g of this.store.data.goals) {
      if (!g.enabled) continue;
      const sameId = g.giftId && g.giftId === ev.giftId;
      const sameName = !g.giftId && g.giftName.toLowerCase() === String(ev.giftName).toLowerCase();
      if (!sameId && !sameName) continue;
      if (!g.giftImage && ev.giftImage) g.giftImage = ev.giftImage;
      this.add(g, n, ev.user);
      touched = true;
    }
    if (touched) this.changed();
  }

  // O que o overlay precisa (sem a lista completa de quem ajudou).
  publicGoal(g) {
    const top = Object.values(g.helpers).sort((a, b) => b.count - a.count)[0] || null;
    const { helpers, ...rest } = g;
    return { ...rest, top };
  }

  publicList() { return this.list().map((g) => this.publicGoal(g)); }
}
