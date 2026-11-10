import { EventEmitter } from 'node:events';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import {
  normalizeChat, normalizeGift, normalizeLike, normalizeFollow,
  normalizeShare, normalizeMember, normalizeRoomUser,
} from './normalize.js';

// Cuida da conexão com a live. Emite:
//  - 'event'  com um evento já normalizado
//  - 'status' sempre que o estado da conexão muda
export class LiveManager extends EventEmitter {
  constructor() {
    super();
    this.connection = null;
    this.status = { state: 'desconectado', username: '', message: '', viewers: 0 };
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  async connect(username) {
    const clean = String(username || '').replace(/^@/, '').trim();
    if (!clean) throw new Error('Informe o @ da live.');
    await this.disconnect();

    this.setStatus({ state: 'conectando', username: clean, message: '', viewers: 0 });
    const conn = new TikTokLiveConnection(clean, {
      // Não usar enableExtendedGiftInfo: a lista de presentes precisa de plano pago do
      // serviço de assinatura. O evento de presente já traz nome, valor e imagem.
      enableExtendedGiftInfo: false,
      processInitialData: false,
    });
    this.connection = conn;

    const forward = (fn) => (data) => {
      try { this.emit('event', fn(data)); } catch (err) { console.error('Evento ignorado:', err.message); }
    };
    conn.on(WebcastEvent.CHAT, forward(normalizeChat));
    conn.on(WebcastEvent.GIFT, forward(normalizeGift));
    conn.on(WebcastEvent.LIKE, forward(normalizeLike));
    conn.on(WebcastEvent.FOLLOW, forward(normalizeFollow));
    conn.on(WebcastEvent.SHARE, forward(normalizeShare));
    conn.on(WebcastEvent.MEMBER, forward(normalizeMember));
    conn.on(WebcastEvent.ROOM_USER, (data) => {
      const ev = normalizeRoomUser(data);
      this.setStatus({ viewers: ev.viewers });
    });
    conn.on(WebcastEvent.STREAM_END, () => {
      if (this.connection === conn) this.setStatus({ state: 'desconectado', message: 'A live terminou.' });
    });
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.connection === conn && this.status.state !== 'desconectado') {
        this.setStatus({ state: 'desconectado', message: 'Conexão encerrada.' });
      }
    });
    conn.on(ControlEvent.ERROR, (err) => {
      console.error('Erro da conexão:', err?.info || err?.exception?.message || err);
    });

    try {
      const state = await conn.connect();
      if (this.connection !== conn) return this.status;
      this.setStatus({ state: 'conectado', message: `Sala ${state.roomId}` });
    } catch (err) {
      if (this.connection === conn) this.connection = null;
      const msg = err?.message || String(err);
      let message = `Não foi possível conectar: ${msg}`;
      if (err?.constructor?.name === 'UserOfflineError' || /offline|not live/i.test(msg)) {
        message = `@${clean} não está ao vivo agora.`;
      } else if (/room id/i.test(msg)) {
        message = `Não encontrei a live de @${clean}. Confira se o @ está certo, se a live está no ar e se a internet está ok.`;
      }
      this.setStatus({ state: 'erro', message });
    }
    return this.status;
  }

  async disconnect() {
    const conn = this.connection;
    this.connection = null;
    if (conn) {
      try { await conn.disconnect(); } catch { /* ignora */ }
      this.setStatus({ state: 'desconectado', message: 'Desconectado.', viewers: 0 });
    }
  }
}
