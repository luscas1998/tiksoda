import { randomUUID } from 'node:crypto';
import { JsonStore } from './store.js';
import { mediaKind } from './media.js';

// Regras do tipo "quando acontecer X, tocar a mídia Y".
//
// Gatilhos:
//   { type: 'gift',  giftId, giftName, perUnit }   presente específico
//   { type: 'likes', mode: 'cada', amount }         a cada N likes na live
//   { type: 'likes', mode: 'meta', amount }         uma vez, ao chegar em N likes na live
//
// Mídia: { file, volume (0-100) }
export class ActionRules {
  constructor(dataDir, media) {
    this.store = new JsonStore(dataDir, 'acoes.json', { rules: [] });
    this.media = media;
  }

  list() { return this.store.data.rules; }

  validate(input) {
    const t = input?.trigger || {};
    const trigger = t.type === 'likes'
      ? { type: 'likes', mode: t.mode === 'meta' ? 'meta' : 'cada', amount: Math.max(1, Math.floor(Number(t.amount) || 0)) }
      : { type: 'gift', giftId: String(t.giftId || '').trim(), giftName: String(t.giftName || '').trim(), perUnit: !!t.perUnit };
    if (trigger.type === 'gift' && !trigger.giftId && !trigger.giftName) throw new Error('Escolha o presente.');
    if (trigger.type === 'likes' && !(trigger.amount > 0)) throw new Error('Informe a quantidade de likes.');
    const file = String(input?.media?.file || '');
    if (!this.media.exists(file)) throw new Error('Escolha uma mídia da biblioteca.');
    const volume = Math.min(100, Math.max(0, Math.round(Number(input?.media?.volume ?? 100))));
    return {
      name: String(input?.name || '').trim().slice(0, 60),
      enabled: input?.enabled !== false,
      trigger,
      media: { file, volume },
    };
  }

  create(input) {
    const rule = { id: randomUUID(), ...this.validate(input) };
    this.store.data.rules.push(rule);
    this.store.save();
    return rule;
  }

  update(id, input) {
    const i = this.store.data.rules.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Regra não encontrada.');
    this.store.data.rules[i] = { id, ...this.validate({ ...this.store.data.rules[i], ...input }) };
    this.store.save();
    return this.store.data.rules[i];
  }

  remove(id) {
    this.store.data.rules = this.store.data.rules.filter((r) => r.id !== id);
    this.store.save();
  }

  play(rule, user, reason) {
    return {
      ruleId: rule.id,
      file: rule.media.file,
      url: `/midia/${encodeURIComponent(rule.media.file)}`,
      kind: mediaKind(rule.media.file),
      volume: rule.media.volume,
      label: rule.name,
      reason,
      user: user || null,
    };
  }

  // Recebe um evento e os totais de likes antes/depois; devolve o que tocar.
  match(ev, likesBefore, likesAfter) {
    const out = [];
    for (const rule of this.store.data.rules) {
      if (!rule.enabled) continue;
      const t = rule.trigger;
      if (t.type === 'gift' && ev.type === 'gift' && !ev.streaking) {
        const sameId = t.giftId && t.giftId === ev.giftId;
        const sameName = !t.giftId && t.giftName && t.giftName.toLowerCase() === String(ev.giftName).toLowerCase();
        if (!sameId && !sameName) continue;
        const times = t.perUnit ? Math.min(ev.repeatCount, 10) : 1;
        for (let i = 0; i < times; i++) out.push(this.play(rule, ev.user, `${ev.repeatCount}x ${ev.giftName}`));
      }
      if (t.type === 'likes' && ev.type === 'like' && likesAfter > likesBefore) {
        if (t.mode === 'meta') {
          if (likesBefore < t.amount && likesAfter >= t.amount) out.push(this.play(rule, null, `${t.amount} likes`));
        } else {
          const n = Math.floor(likesAfter / t.amount) - Math.floor(likesBefore / t.amount);
          for (let i = 0; i < Math.min(n, 3); i++) out.push(this.play(rule, null, `a cada ${t.amount} likes`));
        }
      }
    }
    return out;
  }
}
