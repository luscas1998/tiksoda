import { JsonStore } from './store.js';

// Catálogo de presentes. A lista completa oficial do TikTok só vem pelo plano
// pago do serviço de assinatura, então o app aprende sozinho: todo presente
// que aparece numa live conectada (sua ou de outro criador) fica salvo aqui,
// com nome, valor e imagem.
export class GiftCatalog {
  constructor(dataDir) {
    this.store = new JsonStore(dataDir, 'gifts.json', { gifts: {} });
    this.pending = false;
  }

  learn(ev) {
    if (ev.type !== 'gift' || ev.simulated || !ev.giftId) return;
    const cur = this.store.data.gifts[ev.giftId];
    const next = {
      id: ev.giftId,
      name: ev.giftName,
      coins: ev.coinsEach,
      image: ev.giftImage || cur?.image || '',
    };
    if (cur && cur.name === next.name && cur.coins === next.coins && cur.image === next.image) return;
    this.store.data.gifts[ev.giftId] = next;
    // Grava no máximo a cada 3 segundos.
    if (!this.pending) {
      this.pending = true;
      setTimeout(() => { this.pending = false; this.store.save(); }, 3000).unref();
    }
  }

  list() {
    return Object.values(this.store.data.gifts).sort((a, b) => a.coins - b.coins || a.name.localeCompare(b.name));
  }

  get(id) {
    return this.store.data.gifts[id];
  }
}
