import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { JsonStore } from './store.js';

// Metas: "quero receber 10 Rosas", "quero 5 mil likes", "quero 50 seguidores".
// Cada meta tem seu próprio overlay (/overlay/meta/<id>).
//
// kind:  'gift' (presente específico) · 'likes' · 'follows' · 'shares' · 'coins'
// model: como aparece na tela: 'presente' (presente pulsando, só pra kind gift),
//        'barra', 'circulo', 'numero' ou 'copo'
//
// Ao bater a meta (onComplete):
//   'recomecar'  comemora e começa de novo (o que passar da meta já conta pra próxima)
//   'aumentar'   comemora e a meta sobe (+step), a contagem continua
//   'manter'     comemora e fica "concluída" na tela até você zerar
//   'sumir'      comemora e some da tela até você zerar
//
// Emite 'change' (lista atualizada) e 'complete' (meta batida).
const ON_COMPLETE = new Set(['recomecar', 'aumentar', 'manter', 'sumir']);
export const KINDS = new Set(['gift', 'likes', 'follows', 'shares', 'coins']);
const MODELS = new Set(['presente', 'barra', 'circulo', 'numero', 'copo']);
const HELPER_KINDS = new Set(['gift', 'likes', 'coins']); // dá pra saber "quem mais ajudou"

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
    const kind = KINDS.has(merged.kind) ? merged.kind : 'gift';
    const giftId = kind === 'gift' ? String(merged.giftId || '').trim() : '';
    const giftName = kind === 'gift' ? String(merged.giftName || '').trim() : '';
    if (kind === 'gift' && !giftId && !giftName) throw new Error('Escolha o presente.');
    let model = MODELS.has(merged.model) ? merged.model : (kind === 'gift' ? 'presente' : 'barra');
    if (model === 'presente' && kind !== 'gift') model = 'barra';
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
      kind,
      model,
      giftId,
      giftName,
      giftImage: kind === 'gift' ? String(merged.giftImage || '') : '',
      target,
      step: Math.max(1, Math.floor(Number(merged.step) || target)),
      resetOnNewLive: merged.resetOnNewLive === undefined ? kind !== 'gift' : !!merged.resetOnNewLive,
      textTop: String(merged.textTop ?? '').slice(0, 120),
      textBottom: String(merged.textBottom ?? '{atual}/{meta}').slice(0, 120),
      onComplete: ON_COMPLETE.has(merged.onComplete) ? merged.onComplete : 'recomecar',
      showTop: merged.showTop !== false && HELPER_KINDS.has(kind),
      media,
    };
  }

  create(input) {
    const goal = { id: randomUUID().slice(0, 8), ...this.validate(input), count: 0, completed: false, times: 0, helpers: {} };
    goal.baseTarget = goal.target;
    this.store.data.goals.push(goal);
    this.changed(true);
    return goal;
  }

  update(id, input) {
    const g = this.get(id);
    if (!g) throw new Error('Meta não encontrada.');
    const before = g.target;
    Object.assign(g, this.validate(input, g));
    if (g.target !== before) g.baseTarget = g.target;
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
    this.clear(g);
    this.changed(true);
    return g;
  }

  clear(g) {
    Object.assign(g, { count: 0, completed: false, times: 0, helpers: {}, target: g.baseTarget || g.target });
  }

  // Chamado quando você conecta numa live nova.
  resetForNewLive() {
    let any = false;
    for (const g of this.list()) if (g.resetOnNewLive) { this.clear(g); any = true; }
    if (any) this.changed(true);
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
    if (g.count < g.target) return;
    // Um presente grande pode passar a meta várias vezes: comemora uma vez só.
    if (g.onComplete === 'recomecar') {
      const n = Math.floor(g.count / g.target);
      g.times += n;
      g.count -= n * g.target;
      g.helpers = {};
    } else if (g.onComplete === 'aumentar') {
      const step = g.step || g.baseTarget || 1;
      const n = Math.floor((g.count - g.target) / step) + 1;
      g.times += n;
      g.target += n * step;
    } else {
      g.times += 1;
      g.count = g.target;
      g.completed = true;
    }
    this.emit('complete', g);
  }

  handle(ev) {
    const giftUnits = ev.type === 'gift' ? this.delta(ev) : 0;
    const amountFor = (kind) => {
      switch (kind) {
        case 'gift': return giftUnits;
        case 'coins': return giftUnits * (ev.coinsEach || 0);
        case 'likes': return ev.type === 'like' ? ev.likeCount || 0 : 0;
        case 'follows': return ev.type === 'follow' ? 1 : 0;
        case 'shares': return ev.type === 'share' ? 1 : 0;
        default: return 0;
      }
    };
    let touched = false;
    for (const g of this.store.data.goals) {
      if (!g.enabled) continue;
      const kind = g.kind || 'gift';
      if (kind === 'gift' || kind === 'coins') { if (ev.type !== 'gift') continue; }
      if (kind === 'gift') {
        const sameId = g.giftId && g.giftId === ev.giftId;
        const sameName = !g.giftId && g.giftName.toLowerCase() === String(ev.giftName).toLowerCase();
        if (!sameId && !sameName) continue;
        if (!g.giftImage && ev.giftImage) g.giftImage = ev.giftImage;
      }
      const n = amountFor(kind);
      if (!n) continue;
      this.add(g, n, HELPER_KINDS.has(kind) ? ev.user : null);
      touched = true;
    }
    if (touched) this.changed();
  }

  // O que o overlay precisa (sem a lista completa de quem ajudou).
  publicGoal(g) {
    const top = Object.values(g.helpers).sort((a, b) => b.count - a.count)[0] || null;
    const { helpers, ...rest } = g;
    return { kind: 'gift', model: 'presente', ...rest, top };
  }

  publicList() { return this.list().map((g) => this.publicGoal(g)); }
}
