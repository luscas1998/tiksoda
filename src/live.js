import { EventEmitter } from 'node:events';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import {
  normalizeChat, normalizeGift, normalizeLike, normalizeFollow,
  normalizeShare, normalizeMember, normalizeRoomUser,
} from './normalize.js';

// Cuida da conexão com a live. Emite:
//  - 'event'  com um evento já normalizado
//  - 'status' sempre que o estado da conexão muda
//
// Com autoRetry ligado, se a live não estiver no ar (ou cair/terminar), fica
// tentando de novo a cada RETRY_MS até você clicar em Desconectar.
const RETRY_MS = 30_000;

export class LiveManager extends EventEmitter {
  constructor() {
    super();
    this.connection = null;
    this.autoRetry = true;
    this.retryTimer = null;
    this.wanted = ''; // @ que você pediu pra conectar (vazio = desconectado de propósito)
    this.status = { state: 'desconectado', username: '', message: '', viewers: 0 };
  }

  // Agenda uma nova tentativa (estado 'aguardando').
  scheduleRetry(message) {
    clearTimeout(this.retryTimer);
    if (!this.autoRetry || !this.wanted) return false;
    const user = this.wanted;
    const at = Date.now() + RETRY_MS;
    this.setStatus({ state: 'aguardando', username: user, viewers: 0, retryAt: at, message: `${message} Tentando de novo em ${RETRY_MS / 1000} s.` });
    this.retryTimer = setTimeout(() => {
      if (this.wanted === user) this.connect(user).catch(() => {});
    }, RETRY_MS);
    this.retryTimer.unref?.();
    return true;
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  async connect(username) {
    const clean = String(username || '').replace(/^@/, '').trim();
    if (!clean) throw new Error('Informe o @ da live.');
    await this.disconnect(true);
    this.wanted = clean;

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
      if (this.connection !== conn) return;
      this.connection = null;
      if (!this.scheduleRetry('A live terminou.')) this.setStatus({ state: 'desconectado', message: 'A live terminou.' });
    });
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.connection !== conn || this.status.state === 'desconectado') return;
      this.connection = null;
      if (!this.scheduleRetry('A conexão caiu.')) this.setStatus({ state: 'desconectado', message: 'Conexão encerrada.' });
    });
    conn.on(ControlEvent.ERROR, (err) => {
      console.error('Erro da conexão:', err?.info || err?.exception?.message || err);
    });

    try {
      const state = await conn.connect();
      if (this.connection !== conn) return this.status;
      this.setStatus({ state: 'conectado', roomId: String(state.roomId), message: `Sala ${state.roomId}`, since: Date.now(), retryAt: 0 });
    } catch (err) {
      if (this.connection === conn) this.connection = null;
      const msg = err?.message || String(err);
      let message = `Não foi possível conectar: ${msg}`;
      if (err?.constructor?.name === 'UserOfflineError' || /offline|not live/i.test(msg)) {
        message = `@${clean} não está ao vivo agora.`;
      } else if (/room id/i.test(msg)) {
        message = `Não encontrei a live de @${clean}. Confira se o @ está certo, se a live está no ar e se a internet está ok.`;
      }
      if (!this.scheduleRetry(message)) this.setStatus({ state: 'erro', message });
    }
    return this.status;
  }

  // internal=true: usado ao reconectar (não cancela a vontade de ficar conectado).
  async disconnect(internal = false) {
    clearTimeout(this.retryTimer);
    if (!internal) this.wanted = '';
    const conn = this.connection;
    this.connection = null;
    if (conn) {
      try { await conn.disconnect(); } catch { /* ignora */ }
    }
    if (!internal && (conn || this.status.state !== 'desconectado')) {
      this.setStatus({ state: 'desconectado', message: 'Desconectado.', viewers: 0, retryAt: 0 });
    }
  }
}
