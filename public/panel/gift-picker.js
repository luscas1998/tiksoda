import { escapeHtml, formatNumber } from '/shared/live-client.js';

// Grade de presentes com busca. Também aceita o nome digitado, pra presentes
// que o app ainda não aprendeu.
export function createGiftPicker({ search, grid, empty, chosenLabel, onChange }) {
  let gifts = [];
  let chosen = null; // { giftId, giftName, image }

  const tile = (g, sel) => {
    const img = g.image ? `<img src="${escapeHtml(g.image)}" alt="" loading="lazy">` : '<span class="ph">🎁</span>';
    return `<button type="button" class="gift ${sel ? 'sel' : ''}" data-gift-id="${escapeHtml(g.id || '')}" data-gift-name="${escapeHtml(g.name)}">
      ${img}<span>${escapeHtml(g.name)}</span>${g.coins ? `<small>🪙 ${formatNumber(g.coins)}</small>` : ''}</button>`;
  };
  const isSel = (g) => chosen && (chosen.giftId ? chosen.giftId === g.id : chosen.giftName === g.name);

  function render() {
    const typed = search.value.trim();
    const q = typed.toLowerCase();
    let html = gifts.filter((g) => !q || g.name.toLowerCase().includes(q)).map((g) => tile(g, isSel(g))).join('');
    if (typed && !gifts.some((g) => g.name.toLowerCase() === q)) html += tile({ id: '', name: typed }, isSel({ id: '', name: typed }));
    grid.innerHTML = html;
    empty.textContent = gifts.length
      ? `${gifts.length} presentes conhecidos. A lista cresce sozinha conforme chegam presentes nas lives.`
      : 'O app ainda não conhece nenhum presente. Ele aprende sozinho: conecte numa live movimentada (sua ou de outro criador) por alguns minutos. Enquanto isso, dá pra digitar o nome exato do presente na busca.';
    chosenLabel.textContent = chosen ? chosen.giftName : 'nenhum escolhido';
  }

  search.addEventListener('input', render);
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.gift');
    if (!b) return;
    const g = gifts.find((x) => x.id && x.id === b.dataset.giftId);
    chosen = { giftId: b.dataset.giftId, giftName: b.dataset.giftName, image: g?.image || '' };
    render();
    onChange?.(chosen);
  });

  return {
    setGifts(list) { gifts = list; render(); },
    get gifts() { return gifts; },
    get value() { return chosen; },
    set value(v) { chosen = v; search.value = ''; render(); },
    render,
  };
}
