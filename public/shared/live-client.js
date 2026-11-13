// Cliente usado pelo painel e pelos overlays para receber eventos ao vivo.
// Reconecta sozinho se o app for fechado e aberto de novo.
export function connectLive({ onHello, onEvent, onStatus, onRankings, onMonthly, onGoals, onGoalComplete, onPlay, onTts, onTtsControl, onTtsLog, onWheels, onWheelSpin, onMusic, onMusicRequest, onMusicLog, onSocket } = {}) {
  let retry = 500;
  // O painel (shell.js) escuta estes eventos pra mostrar o status no topo.
  const emit = (name, detail) => { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* overlay */ } };
  function open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { retry = 500; onSocket?.(true); emit('tiksoda:socket', true); };
    ws.onmessage = (msg) => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      if (data.kind === 'hello' || data.kind === 'status') emit('tiksoda:status', data.status);
      if (data.kind === 'hello') onHello?.(data);
      else if (data.kind === 'event') onEvent?.(data.event);
      else if (data.kind === 'status') onStatus?.(data.status);
      else if (data.kind === 'rankings') onRankings?.(data.rankings);
      else if (data.kind === 'play') onPlay?.(data.play);
      else if (data.kind === 'monthly') onMonthly?.(data.rankings);
      else if (data.kind === 'goals') onGoals?.(data.goals);
      else if (data.kind === 'goal-complete') onGoalComplete?.(data.goal);
      else if (data.kind === 'tts') onTts?.(data.item);
      else if (data.kind === 'tts-control') onTtsControl?.(data.action);
      else if (data.kind === 'tts-log') onTtsLog?.(data.log);
      else if (data.kind === 'wheels') onWheels?.(data.wheels);
      else if (data.kind === 'wheel-spin') onWheelSpin?.(data.spin);
      else if (data.kind === 'music') onMusic?.(data.music);
      else if (data.kind === 'music-request') onMusicRequest?.(data.request);
      else if (data.kind === 'music-log') onMusicLog?.(data.log);
    };
    ws.onclose = () => {
      onSocket?.(false);
      emit('tiksoda:socket', false);
      setTimeout(open, retry);
      retry = Math.min(retry * 2, 5000);
    };
  }
  open();
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(name) {
  return String(name || '?').trim().slice(0, 1).toUpperCase() || '?';
}

// Texto curto de um evento, usado no painel e no overlay de eventos.
export function describe(ev) {
  switch (ev.type) {
    case 'chat': return ev.comment;
    case 'gift': return `enviou ${ev.repeatCount}x ${ev.giftName} (${ev.totalCoins} coins)`;
    case 'like': return `curtiu ${ev.likeCount}x`;
    case 'follow': return 'começou a seguir';
    case 'share': return 'compartilhou a live';
    case 'member': return 'entrou na live';
    default: return ev.type;
  }
}

export function formatNumber(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',') + ' mi';
  if (n >= 10_000) return (n / 1000).toFixed(1).replace('.0', '').replace('.', ',') + ' mil';
  return n.toLocaleString('pt-BR');
}
