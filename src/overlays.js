// Lista de overlays. Cada um tem seu próprio link para colocar como
// fonte "Link" (navegador) no TikTok LIVE Studio.
// `ready: false` aparece no painel como "em breve".

export const OVERLAYS = [
  {
    slug: 'eventos',
    name: 'Feed de eventos',
    description: 'Lista ao vivo de comentários, presentes, follows e shares.',
    size: '400 x 600',
    ready: true,
  },
  {
    slug: 'alertas',
    name: 'Alertas',
    description: 'Alerta grande na tela para presentes, follows e shares.',
    size: '800 x 300',
    ready: false,
  },
  {
    slug: 'ranking-likes',
    name: 'Ranking de likes',
    description: 'Top quem mais curtiu na live.',
    size: '400 x 500',
    ready: false,
  },
  {
    slug: 'ranking-coins',
    name: 'Ranking de coins',
    description: 'Top quem mais mandou presentes, em coins.',
    size: '400 x 500',
    ready: false,
  },
  {
    slug: 'midia',
    name: 'Áudio e vídeo por presente',
    description: 'Toca o áudio ou vídeo configurado para cada presente.',
    size: '1920 x 1080',
    ready: false,
  },
];
