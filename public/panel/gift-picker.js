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
      : 'A lista está vazia. Clique em "Atualizar lista do TikTok" pra baixar todos os presentes com ícone. O app também aprende sozinho com os presentes que chegam nas lives.';
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

// Botão "Atualizar lista do TikTok": baixa a lista oficial com ícones.
export function setupGiftRefresh(button, msgEl, onDone) {
  const setMsg = (text, kind = '') => { msgEl.className = `msg ${kind}`; msgEl.textContent = text; };
  const run = async (username = '') => {
    button.disabled = true;
    setMsg('Baixando a lista do TikTok… pode levar até 1 minuto.');
    try {
      const res = await fetch('/api/gifts/atualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
      const data = await res.json();
      if (data.needUser) {
        const u = await askText('Você não está conectado numa live. Digite o @ de alguém que esteja ao vivo agora (pode ser um criador grande):', '@usuario');
        if (u) return run(u);
        setMsg('');
        return;
      }
      if (!res.ok) throw new Error(data.error);
      setMsg(`Pronto: ${data.total} presentes na lista (${data.added} novos).`, 'ok');
      onDone?.();
    } catch (err) {
      setMsg(err.message, 'err');
    } finally {
      button.disabled = false;
    }
  };
  button.addEventListener('click', () => run());
}
