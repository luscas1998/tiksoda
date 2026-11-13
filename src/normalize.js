// Converte os eventos crus da biblioteca do TikTok num formato simples,
// que o painel e os overlays usam. Se a biblioteca mudar nomes de campos,
// só este arquivo precisa ser ajustado.

const firstUrl = (img) => (img && Array.isArray(img.urlList) && img.urlList[0]) || '';

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Selos do TikTok (tipo do selo): 1 moderador, 3 amigos, 4/7 assinante, 10 fã-clube (quem mandou Heart Me).
const BADGE_MOD = 1;
const BADGE_SUB = [4, 7];
const BADGE_FAN = 10;

// O que a pessoa é na live: seguidor, amigo, fã-clube (Heart Me), assinante, moderador.
export function userRoles(u) {
  if (!u) return {};
  const scenes = (u.badgeList || u.badges || []).map((b) => Number(b?.sceneType ?? b?.badgeScene ?? b?.badgeSceneType ?? 0));
  const follow = Number(u.followInfo?.followStatus ?? u.followRole ?? 0);
  const fanLevel = Number(u.fansClub?.data?.level || 0) || (scenes.includes(BADGE_FAN) ? 1 : 0) || Number(u.teamMemberLevel || 0);
  return {
    seguidor: follow >= 1,
    amigo: follow >= 2 || scenes.includes(3),
    fa: fanLevel > 0,
    faNivel: fanLevel,
    assinante: scenes.some((s) => BADGE_SUB.includes(s)) || !!u.isSubscriber,
    moderador: scenes.includes(BADGE_MOD) || !!u.userAttr?.isAdmin || !!u.userAttr?.isSuperAdmin || !!u.isModerator,
  };
}

export function normalizeUser(u) {
  if (!u) return { id: '', username: 'anonimo', nickname: 'Anônimo', avatar: '', roles: {} };
  const username = u.displayId || u.uniqueId || u.username || '';
  return {
    id: String(u.id ?? u.userId ?? username),
    username,
    nickname: u.nickname || username || 'Anônimo',
    avatar: firstUrl(u.avatarThumb) || firstUrl(u.avatarMedium) || u.profilePictureUrl || '',
    roles: userRoles(u),
  };
}

let seq = 0;
const base = (type, raw) => ({
  id: `${Date.now()}-${++seq}`,
  type,
  at: Date.now(),
  user: normalizeUser(raw?.user),
});

export function normalizeChat(raw) {
  return { ...base('chat', raw), comment: raw.comment || raw.content || '' };
}

export function normalizeGift(raw) {
  const g = raw.gift || raw.extendedGiftInfo || raw.giftDetails || {};
  const giftType = toNumber(g.type ?? g.giftType);
  const repeatCount = Math.max(1, toNumber(raw.repeatCount) || 1);
  const coinsEach = toNumber(g.diamondCount ?? g.diamond_count);
  // Presentes de combo (tipo 1) chegam várias vezes durante a sequência.
  // Só o último evento (repeatEnd) vale para contagem e ações.
  const streaking = giftType === 1 && !raw.repeatEnd;
  return {
    ...base('gift', raw),
    giftId: String(raw.giftId ?? g.id ?? ''),
    giftName: g.name || g.giftName || `Presente ${raw.giftId ?? ''}`.trim(),
    giftImage: firstUrl(g.image) || firstUrl(g.icon) || '',
    coinsEach,
    repeatCount,
    totalCoins: coinsEach * repeatCount,
    streaking,
    groupId: String(raw.groupId ?? ''),
  };
}

export function normalizeLike(raw) {
  return {
    ...base('like', raw),
    likeCount: toNumber(raw.count ?? raw.likeCount),
    totalLikes: toNumber(raw.total ?? raw.totalLikeCount),
  };
}

export function normalizeFollow(raw) {
  return base('follow', raw);
}

export function normalizeShare(raw) {
  return base('share', raw);
}

export function normalizeMember(raw) {
  return base('member', raw);
}

export function normalizeRoomUser(raw) {
  return {
    id: `${Date.now()}-${++seq}`,
    type: 'viewers',
    at: Date.now(),
    viewers: toNumber(raw.total ?? raw.viewerCount),
  };
}
