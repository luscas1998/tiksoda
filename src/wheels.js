import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { JsonStore } from './store.js';

// Roletas. Cada uma tem seu link (/overlay/roleta/<id>) e gira:
//   - pelo botão "Girar" do painel;
//   - quando alguém comenta o comando (ex.: !roleta);
//   - quando chega o presente escolhido.
//
// O servidor sorteia o resultado e marca a hora em que cada giro começa
// (startAt), pra que o overlay e a mídia do resultado fiquem sincronizados
// mesmo com vários giros na fila.
//
// Emite 'change' (lista) e 'spin' (um giro novo).
const COLORS = ['#ff4f8b', '#25f4ee', '#ffc93c', '#9a8cff', '#3ddc84', '#ff8a3d', '#4f9dff', '#f25cf2'];
const MAX_QUEUE = 10;

const clamp = (n, min, max, def) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
};

export class Wheels extends EventEmitter {
  constructor(dataDir, media) {
    super();
    this.store = new JsonStore(dataDir, 'roletas.json', { wheels: [] });
    this.media = media;
    this.busyUntil = new Map();   // id -> quando o último giro da fila termina
    this.queued = new Map();      // id -> giros esperando
    this.lastCommand = new Map(); // id -> último giro por comando
    this.history = new Map();     // id -> últimos resultados
  }

  list() { return this.store.data.wheels; }
  get(id) { return this.list().find((w) => w.id === id); }

  validate(input, current = {}) {
    const m = { ...current, ...input };
    const options = (Array.isArray(m.options) ? m.options : [])
      .map((o, i) => {
        let media = null;
        if (o?.media?.file) {
          if (!this.media.exists(o.media.file)) throw new Error(`Mídia "${o.media.file}" não encontrada na biblioteca.`);
          media = { file: o.media.file, volume: clamp(o.media.volume, 0, 100, 100) };
        }
        return {
          label: String(o?.label || '').trim().slice(0, 40),
          color: /^#[0-9a-f]{6}$/i.test(o?.color) ? o.color : COLORS[i % COLORS.length],
          weight: clamp(o?.weight, 1, 100, 1),
          media,
        };
      })
      .filter((o) => o.label);
    if (options.length < 2) throw new Error('A roleta precisa de pelo menos 2 opções.');
    if (options.length > 24) throw new Error('No máximo 24 opções.');
    const command = String(m.command || '').trim().split(/\s+/)[0].toLowerCase().slice(0, 30);
    return {
      name: String(m.name || '').trim().slice(0, 60),
      title: String(m.title ?? '').slice(0, 80),
      enabled: m.enabled !== false,
      options,
      command,
      commandWho: m.commandWho === 'presente' ? 'presente' : 'todos',
      cooldown: Math.round(clamp(m.cooldown, 0, 3600, 30)),
      giftId: String(m.giftId || '').trim(),
      giftName: String(m.giftName || '').trim(),
      giftImage: String(m.giftImage || ''),
      giftMode: m.giftMode === 'cada' ? 'cada' : 'uma',
      spinSeconds: Math.round(clamp(m.spinSeconds, 2, 20, 6)),
      showSeconds: Math.round(clamp(m.showSeconds, 1, 30, 5)),
      hideIdle: m.hideIdle !== false,
    };
  }

  create(input) {
    const w = { id: randomUUID().slice(0, 8), ...this.validate(input) };
    this.list().push(w);
    this.save();
    return w;
  }

  update(id, input) {
    const w = this.get(id);
    if (!w) throw new Error('Roleta não encontrada.');
    Object.assign(w, this.validate(input, w));
    this.save();
    return w;
  }

  remove(id) {
    this.store.data.wheels = this.list().filter((w) => w.id !== id);
    this.save();
  }

  save() {
    this.store.save();
    this.emit('change', this.list());
  }

  recent(id) { return this.history.get(id) || []; }

  // Sorteia e agenda um giro. Devolve o giro, ou null se a fila estiver cheia.
  spin(id, user = null, reason = 'painel') {
    const w = this.get(id);
    if (!w) throw new Error('Roleta não encontrada.');
    const queued = this.queued.get(id) || 0;
    if (queued >= MAX_QUEUE) return null;

    const total = w.options.reduce((s, o) => s + o.weight, 0);
    let r = Math.random() * total;
    let index = 0;
    for (; index < w.options.length - 1; index++) {
      r -= w.options[index].weight;
      if (r < 0) break;
    }
    const now = Date.now();
    const startAt = Math.max(now + 150, this.busyUntil.get(id) || 0);
    const spinMs = w.spinSeconds * 1000;
    const endAt = startAt + spinMs + w.showSeconds * 1000 + 400;
    this.busyUntil.set(id, endAt);
    this.queued.set(id, queued + 1);
    setTimeout(() => this.queued.set(id, Math.max(0, (this.queued.get(id) || 1) - 1)), endAt - now);

    const option = w.options[index];
    const spin = {
      id: `${id}-${now}-${Math.random().toString(36).slice(2, 6)}`,
      wheelId: id, index, label: option.label, color: option.color,
      user, reason, startAt, spinMs, showMs: w.showSeconds * 1000,
    };
    const h = this.history.get(id) || [];
    h.unshift({ label: option.label, user: user ? user.nickname : null, reason, at: startAt + spinMs });
    this.history.set(id, h.slice(0, 20));
    this.emit('spin', spin, option, w);
    return spin;
  }

  // Comentários (comando) e presentes.
  handle(ev, coinsOf) {
    for (const w of this.list()) {
      if (!w.enabled) continue;
      if (ev.type === 'chat' && w.command) {
        const first = String(ev.comment || '').trim().split(/\s+/)[0].toLowerCase();
        if (first !== w.command) continue;
        if (w.commandWho === 'presente' && coinsOf(ev.user) < 1) continue;
        const last = this.lastCommand.get(w.id) || 0;
        if (Date.now() - last < w.cooldown * 1000) continue;
        this.lastCommand.set(w.id, Date.now());
        this.spin(w.id, ev.user, w.command);
      }
      if (ev.type === 'gift' && !ev.streaking && (w.giftId || w.giftName)) {
        const sameId = w.giftId && w.giftId === ev.giftId;
        const sameName = !w.giftId && w.giftName.toLowerCase() === String(ev.giftName).toLowerCase();
        if (!sameId && !sameName) continue;
        const times = w.giftMode === 'cada' ? Math.min(ev.repeatCount, MAX_QUEUE) : 1;
        for (let i = 0; i < times; i++) this.spin(w.id, ev.user, `${ev.repeatCount}x ${ev.giftName}`);
      }
    }
  }
}
