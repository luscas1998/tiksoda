// Temas dos overlays (o tema vai no link: ?tema=neon).
export const THEMES = [
  { id: '', name: 'Escuro (padrão)' },
  { id: 'neon', name: 'Neon' },
  { id: 'claro', name: 'Claro' },
  { id: 'minimalista', name: 'Minimalista' },
];

export function themeSelect(current = '') {
  return `<select class="theme-select" title="Tema do overlay">${THEMES.map((t) =>
    `<option value="${t.id}" ${t.id === current ? 'selected' : ''}>${t.name}</option>`).join('')}</select>`;
}

// Troca (ou tira) o ?tema= de um link, mantendo as outras opções.
export function withTheme(link, theme) {
  try {
    const u = new URL(link, location.origin);
    if (theme) u.searchParams.set('tema', theme); else u.searchParams.delete('tema');
    return /^https?:/.test(link) ? u.toString() : u.pathname + u.search;
  } catch { return link; }
}

export function themeOf(link) {
  try { return new URL(link, location.origin).searchParams.get('tema') || ''; } catch { return ''; }
}

// Link de prévia: mesmo link com ?previa=1 (sem som), só o caminho.
export function previewOf(link) {
  try {
    const u = new URL(link, location.origin);
    u.searchParams.set('previa', '1');
    return u.pathname + u.search;
  } catch { return link; }
}

// Endereço dos links dos overlays. O LIVE Studio recusa "localhost" e "127.0.0.1" no campo
// de link; tiksoda.localtest.me é um nome público que aponta pro próprio PC (127.0.0.1).
export const overlayBase = (port) => `http://tiksoda.localtest.me:${port}`;
