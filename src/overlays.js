// Lista de overlays. Cada um tem seu próprio link para colocar como
// fonte "Link" (navegador) no TikTok LIVE Studio.
// `ready: false` aparece no painel como "em breve".
// `file` permite que dois overlays usem o mesmo HTML (ex.: os dois rankings).

export const OVERLAYS = [
  {
    slug: 'eventos',
    name: 'Feed de eventos',
    description: 'Lista ao vivo de comentários, presentes, follows e shares.',
    size: '400 x 600',
    options: 'max=6 · tempo=20 · tipos=chat,gift,follow,share',
    ready: true,
  },
  {
    slug: 'alertas',
    name: 'Alertas',
    description: 'Alerta grande na tela para presentes, follows e shares.',
    size: '800 x 300',
    options: 'tipos=gift,follow,share · min=10 (coins) · tempo=5 (segundos)',
    ready: true,
  },
  {
    slug: 'ranking-likes',
    file: 'ranking',
    options: 'top=5 · titulo=Meu top · fundo=0 · cor=ff4f8b',
    name: 'Ranking de likes',
    description: 'Top quem mais curtiu na live.',
    size: '400 x 500',
    ready: true,
  },
  {
    slug: 'ranking-coins',
    file: 'ranking',
    options: 'top=5 · titulo=Meu top · fundo=0 · cor=ffc93c',
    name: 'Ranking de coins',
    description: 'Top quem mais mandou presentes, em coins.',
    size: '400 x 500',
    ready: true,
  },
  {
    slug: 'midia',
    name: 'Áudio e vídeo das ações',
    description: 'Toca os áudios e vídeos das suas ações (presentes e metas de likes). Configure na aba Ações.',
    size: '1920 x 1080',
    options: 'fila=0 (toca tudo junto) · volume=80 (volume geral) · ajustar=0 (vídeo no tamanho original)',
    ready: true,
  },
];
