// Moldura do painel: menu lateral, barra do topo, status da live, avisos e diálogos.
// Carregado como script comum logo no começo do <body>, antes do conteúdo da página.
(function () {
  const ICONS = {
    soda: '<path d="M7 3h10l-1.2 17.2a2 2 0 0 1-2 1.8h-3.6a2 2 0 0 1-2-1.8L7 3z"/><path d="M6 7h12"/><path d="M13 3l2-2"/>',
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    layers: '<path d="M12 2l10 6-10 6L2 8l10-6z"/><path d="M2 14l10 6 10-6"/>',
    zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    wheel: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
    voice: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    power: '<path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 2v10"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.8-2.5L14 9V3"/><path d="M7 15h10"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8z"/><path d="M12 18v4"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    gauge: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  };
  const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  window.icon = icon;

  const PAGES = [
    { id: 'inicio', href: '/painel/', icon: 'home', label: 'Início' },
    { id: 'overlays', href: '/painel/overlays.html', icon: 'layers', label: 'Overlays' },
    { sep: true },
    { id: 'acoes', href: '/painel/acoes.html', icon: 'zap', label: 'Ações' },
    { id: 'metas', href: '/painel/metas.html', icon: 'target', label: 'Metas' },
    { id: 'roleta', href: '/painel/roleta.html', icon: 'wheel', label: 'Roleta' },
    { id: 'tts', href: '/painel/tts.html', icon: 'voice', label: 'TTS' },
    { id: 'musica', href: '/painel/musica.html', icon: 'music', label: 'Música' },
    { sep: true },
    { id: 'config', href: '/painel/config.html', icon: 'gear', label: 'Configurações' },
  ];
  const body = document.body;
  try { if (localStorage.getItem('tiksoda:anim') === '0') document.documentElement.classList.add('no-anim'); } catch { /* sem armazenamento */ }
  const page = body.dataset.page || '';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const aside = document.createElement('aside');
  aside.className = 'sidebar';
  aside.innerHTML = `
    <a class="brand" href="/painel/"><span class="logo">${icon('soda')}</span><span><b>TikSoda</b><small id="app-version">v0.7</small></span></a>
    <nav class="nav">${PAGES.map((p) => p.sep ? '<div class="sep"></div>'
      : `<a href="${p.href}" class="${p.id === page ? 'active' : ''}" title="${p.label}">${icon(p.icon)}<span>${p.label}</span></a>`).join('')}</nav>
    <div class="side-foot">
      <div class="live-card"><div class="who" id="side-who">Desconectado</div><div class="meta"><span id="side-viewers"></span><span id="side-timer"></span></div></div>
      <div class="ver"><span>Feito pra sua live 💗</span><button type="button" id="btn-quit" title="Fechar o TikSoda">${icon('power')}</button></div>
    </div>`;

  const top = document.createElement('header');
  top.className = 'topbar';
  top.innerHTML = `
    <div class="titles"><h1>${esc(body.dataset.title || document.title.replace(/^TikSoda · /, ''))}</h1>${body.dataset.sub ? `<div class="sub">${esc(body.dataset.sub)}</div>` : ''}</div>
    <div id="status" class="status desconectado"><span class="dot"></span><span id="status-text">Desconectado</span><span class="extra" id="status-extra"></span></div>`;

  const me = document.currentScript;
  me.after(aside, top);

  // ---------- status da live (vem do live-client) ----------
  const LABEL = { desconectado: 'Desconectado', conectando: 'Conectando…', conectado: 'Ao vivo', aguardando: 'Esperando a live', erro: 'Erro' };
  let since = 0;
  let savedUser = '';
  let status = { state: 'desconectado' };
  const fmtTime = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  };
  function tick() {
    const live = status.state === 'conectado' && since;
    const t = live ? fmtTime(Date.now() - since) : '';
    const el = document.getElementById('side-timer');
    if (el) el.textContent = t ? `⏱ ${t}` : '';
    const extra = document.getElementById('status-extra');
    if (extra) {
      if (live) extra.textContent = `· ${t}`;
      else if (status.state === 'aguardando' && status.retryAt) extra.textContent = `· ${Math.max(0, Math.ceil((status.retryAt - Date.now()) / 1000))} s`;
      else extra.textContent = '';
    }
  }
  setInterval(tick, 1000);
  window.addEventListener('tiksoda:status', (e) => {
    status = e.detail || status;
    since = status.since || 0;
    const el = document.getElementById('status');
    el.className = `status ${status.state}`;
    document.getElementById('status-text').textContent = status.state === 'conectado' || status.state === 'aguardando'
      ? `${LABEL[status.state]} · @${status.username}` : LABEL[status.state] || status.state;
    const who = status.username || savedUser;
    document.getElementById('side-who').textContent = who ? `@${who}` : 'Nenhum @ salvo';
    document.getElementById('side-viewers').textContent = status.state === 'conectado' ? `👁 ${Number(status.viewers || 0).toLocaleString('pt-BR')}` : LABEL[status.state] || '';
    body.classList.remove('status-conectado', 'status-desconectado', 'status-conectando', 'status-aguardando', 'status-erro');
    body.classList.add(`status-${status.state}`);
    tick();
  });

  // App fechado: aviso no topo até voltar.
  let offline = null;
  window.addEventListener('tiksoda:socket', (e) => {
    if (e.detail) { offline?.remove(); offline = null; return; }
    if (offline) return;
    offline = document.createElement('div');
    offline.className = 'offline-bar';
    offline.textContent = 'O TikSoda foi fechado. Abra de novo pra continuar.';
    document.body.appendChild(offline);
  });

  // ---------- avisos ----------
  let box = null;
  window.toast = (msg, kind = 'ok', ms = 3200) => {
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = `<span class="dot"></span><span>${esc(msg)}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, ms);
  };

  // Diálogo de confirmação: await ask('Apagar?') -> true/false
  window.ask = (text, { ok = 'Confirmar', cancel = 'Cancelar', danger = false } = {}) => new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'dialog-bg';
    bg.innerHTML = `<div class="dialog" role="dialog" aria-modal="true"><p>${esc(text)}</p>
      <div class="row"><button type="button" class="secondary" data-a="0">${esc(cancel)}</button><button type="button" class="${danger ? 'danger' : ''}" data-a="1">${esc(ok)}</button></div></div>`;
    const done = (v) => { bg.remove(); document.removeEventListener('keydown', key); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
    bg.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) done(b.dataset.a === '1'); else if (e.target === bg) done(false); });
    document.addEventListener('keydown', key);
    document.body.appendChild(bg);
    bg.querySelector('[data-a="1"]').focus();
  });

  // Pergunta com campo de texto: await askText('Qual o @?') -> texto ou ''
  window.askText = (text, placeholder = '') => new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'dialog-bg';
    bg.innerHTML = `<form class="dialog"><p>${esc(text)}</p><input placeholder="${esc(placeholder)}" style="width:100%;margin-bottom:16px">
      <div class="row"><button type="button" class="secondary" data-a="0">Cancelar</button><button type="submit">OK</button></div></form>`;
    const input = bg.querySelector('input');
    const done = (v) => { bg.remove(); resolve(v); };
    bg.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); done(input.value.trim()); });
    bg.addEventListener('click', (e) => { if (e.target.closest('[data-a="0"]') || e.target === bg) done(''); });
    bg.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(''); });
    document.body.appendChild(bg);
    input.focus();
  });

  // ---------- prévias leves ----------
  // Iframes com data-src só carregam quando aparecem na tela e são descarregados
  // quando saem. Dá pra desligar todas em Configurações (PCs mais fracos).
  const previewsOn = () => { try { return localStorage.getItem('tiksoda:previas') !== '0'; } catch { return true; } };
  window.previewsOn = previewsOn;
  let io = null;
  window.lazyFrames = (root = document) => {
    const frames = root.querySelectorAll('iframe[data-src]');
    if (!previewsOn()) {
      frames.forEach((f) => {
        if (f.parentElement.querySelector('.off')) return;
        const off = document.createElement('div');
        off.className = 'off';
        off.textContent = 'Prévia desligada (Configurações)';
        f.after(off);
      });
      return;
    }
    io ??= new IntersectionObserver((entries) => {
      for (const en of entries) {
        const f = en.target;
        if (en.isIntersecting) { if (f.src !== new URL(f.dataset.src, location.href).href) f.src = f.dataset.src; clearTimeout(f._unload); }
        else if (f.getAttribute('src')) f._unload = setTimeout(() => { f.removeAttribute('src'); }, 8000);
      }
    }, { rootMargin: '200px' });
    frames.forEach((f) => io.observe(f));
  };
  // Trocar o link de uma prévia já observada.
  window.setFrameSrc = (f, src) => {
    f.dataset.src = src;
    if (previewsOn() && f.getAttribute('src')) f.src = src;
  };

  // ---------- fechar o app ----------
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#btn-quit')) return;
    if (!(await window.ask('Fechar o TikSoda? Os overlays param de funcionar até você abrir de novo.', { ok: 'Fechar', danger: true }))) return;
    await fetch('/api/sair', { method: 'POST' }).catch(() => {});
    document.body.innerHTML = '<div style="grid-column:1/-1;display:grid;place-items:center;height:100vh;color:#9a9ab0;font:16px Segoe UI,system-ui">O TikSoda foi fechado. Pode fechar esta janela.</div>';
    setTimeout(() => window.close(), 800);
  });

  fetch('/api/status').then((r) => r.json()).then((i) => {
    document.getElementById('app-version').textContent = `v${i.version || ''}`;
    savedUser = i.config?.username || '';
    window.dispatchEvent(new CustomEvent('tiksoda:status', { detail: i.status }));
  }).catch(() => {});
})();
