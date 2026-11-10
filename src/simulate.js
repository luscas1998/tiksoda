// Eventos falsos para testar o painel e os overlays sem estar ao vivo.

const USERS = [
  { id: 'u1', username: 'maria.souza', nickname: 'Maria 🌸' },
  { id: 'u2', username: 'joaogamer', nickname: 'João Gamer' },
  { id: 'u3', username: 'ana_beatriz', nickname: 'Ana B.' },
  { id: 'u4', username: 'pedrinho77', nickname: 'Pedrinho' },
  { id: 'u5', username: 'carla.live', nickname: 'Carla ✨' },
];

const GIFTS = [
  { giftId: '5655', giftName: 'Rosa', coinsEach: 1 },
  { giftId: '5269', giftName: 'TikTok', coinsEach: 1 },
  { giftId: '5879', giftName: 'Rosquinha', coinsEach: 30 },
  { giftId: '6064', giftName: 'Chapéu', coinsEach: 99 },
  { giftId: '6369', giftName: 'Leão', coinsEach: 29999 },
];

const COMMENTS = ['Boa noite!! 👋', 'Manda salve pra mim', 'kkkkkk', 'Que live top 🔥', 'De onde você é?'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
let seq = 0;
const base = (type) => ({ id: `sim-${Date.now()}-${++seq}`, type, at: Date.now(), simulated: true, user: { ...pick(USERS), avatar: '' } });

export function simulate(type) {
  switch (type) {
    case 'chat':
      return { ...base('chat'), comment: pick(COMMENTS) };
    case 'gift': {
      const g = pick(GIFTS);
      const repeatCount = g.coinsEach >= 1000 ? 1 : 1 + Math.floor(Math.random() * 10);
      return { ...base('gift'), ...g, giftImage: '', repeatCount, totalCoins: g.coinsEach * repeatCount, streaking: false, groupId: '' };
    }
    case 'like': {
      const likeCount = 5 + Math.floor(Math.random() * 30);
      return { ...base('like'), likeCount, totalLikes: 0 };
    }
    case 'follow': {
      // id único para o teste não ser barrado como "já seguiu".
      const ev = base('follow');
      ev.user.id = `${ev.user.id}-${seq}`;
      return ev;
    }
    case 'share':
    case 'member':
      return base(type);
    default:
      throw new Error(`Tipo de teste desconhecido: ${type}`);
  }
}

// Combo de rosas como o TikTok manda: vários eventos com a contagem subindo
// (streaking) e um final com o total.
export function simulateCombo(publish, total = 8) {
  const user = { ...pick(USERS), avatar: '' };
  const groupId = String(Date.now());
  let count = 0;
  const step = () => {
    count = Math.min(total, count + 1 + Math.floor(Math.random() * 2));
    const final = count >= total;
    publish({
      id: `sim-${Date.now()}-${++seq}`, type: 'gift', at: Date.now(), simulated: true, user,
      giftId: '5655', giftName: 'Rosa', coinsEach: 1, giftImage: '', repeatCount: count,
      totalCoins: count, streaking: !final, groupId,
    });
    if (!final) setTimeout(step, 250);
  };
  step();
}
