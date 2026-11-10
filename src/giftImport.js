import { existsSync } from 'node:fs';
import path from 'node:path';
import { TikTokLiveConnection } from 'tiktok-live-connector';

// Baixa a lista oficial de presentes do TikTok (nome, valor, ícone e ID).
//
// Tenta dois caminhos, nesta ordem:
//   1. Pedido direto ao TikTok (rápido, mas o TikTok às vezes exige assinatura).
//   2. Abre a página da live num Edge/Chrome invisível do seu PC e pega a lista
//      que a própria página do TikTok baixa para o painel de presentes.

const firstUrl = (img) => {
  if (!img) return '';
  const list = img.url_list || img.urlList || img.url || [];
  return Array.isArray(list) ? list[0] || '' : String(list);
};

// Procura, em qualquer formato de resposta, objetos que pareçam presentes.
export function extractGifts(json) {
  const found = new Map();
  const seen = new Set();
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 8 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    const coins = node.diamond_count ?? node.diamondCount;
    const id = node.id ?? node.gift_id ?? node.giftId;
    if (coins !== undefined && id !== undefined && node.name) {
      const key = String(id);
      if (!found.has(key)) {
        found.set(key, {
          id: key,
          name: String(node.name),
          coins: Number(coins) || 0,
          image: firstUrl(node.image) || firstUrl(node.icon) || '',
        });
      }
    }
    for (const v of Object.values(node)) walk(v, depth + 1);
  };
  walk(json, 0);
  return [...found.values()].filter((g) => g.name && g.image);
}

async function viaDirect(username) {
  const conn = new TikTokLiveConnection(username, { fetchRoomInfoOnConnect: false });
  const roomId = await conn.fetchRoomId();
  const json = await conn.webClient.getJsonObjectFromWebcastApi('gift/list/', {
    ...conn.webClient.clientParams,
    room_id: roomId,
  }, false);
  return extractGifts(json);
}

function findBrowser() {
  const env = process.env.TIKSODA_BROWSER;
  const pf = process.env['PROGRAMFILES'] || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    env,
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

async function viaBrowser(username, timeoutMs = 35000) {
  const executablePath = findBrowser();
  if (!executablePath) throw new Error('Não achei o Edge nem o Chrome no seu PC.');
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--mute-audio', '--no-first-run', '--no-default-browser-check'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
    const gifts = new Map();
    const done = new Promise((resolve) => {
      page.on('response', async (res) => {
        const url = res.url();
        if (!/\/webcast\/gift\/(list|gallery)/.test(url)) return;
        try {
          for (const g of extractGifts(await res.json())) gifts.set(g.id, g);
          if (gifts.size > 20) resolve();
        } catch { /* resposta que não é JSON */ }
      });
    });
    await page.goto(`https://www.tiktok.com/@${encodeURIComponent(username)}/live`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await Promise.race([done, new Promise((r) => setTimeout(r, timeoutMs))]);
    return [...gifts.values()];
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function importTikTokGifts(username) {
  const user = String(username || '').replace(/^@/, '').trim();
  if (!user) throw new Error('Informe o @ de alguém que esteja ao vivo agora.');
  const errors = [];
  try {
    const gifts = await viaDirect(user);
    if (gifts.length) return { gifts, method: 'direto' };
    errors.push('pedido direto voltou vazio');
  } catch (err) { errors.push(`pedido direto: ${err.message}`); }
  try {
    const gifts = await viaBrowser(user);
    if (gifts.length) return { gifts, method: 'navegador' };
    errors.push('a página da live não trouxe a lista');
  } catch (err) { errors.push(`navegador: ${err.message}`); }
  const e = new Error(`Não consegui baixar a lista. Confira se @${user} está ao vivo agora e tente de novo. (${errors.join('; ')})`);
  throw e;
}
