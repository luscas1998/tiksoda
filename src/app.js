import { existsSync, mkdirSync, accessSync, constants, appendFileSync, statSync, renameSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

// Onde ficam os arquivos do app e os seus dados, rodando pelo Node (iniciar.bat)
// ou pelo TikSoda.exe.

export const PACKAGED = !!process.pkg;

// Pasta do código (public/, src/). No .exe fica dentro do próprio executável.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function writable(dir) {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch { return false; }
}

// Dados: TIKSODA_DATA > pasta "data" ao lado do .exe (ou do projeto) > %APPDATA%\TikSoda.
function pickDataDir() {
  if (process.env.TIKSODA_DATA) return process.env.TIKSODA_DATA;
  const beside = PACKAGED ? path.join(path.dirname(process.execPath), 'data') : path.join(ROOT, 'data');
  if (writable(beside)) return beside;
  const appData = process.env.APPDATA || path.join(os.homedir(), '.config');
  return path.join(appData, 'TikSoda');
}
export const DATA_DIR = pickDataDir();

// No .exe não há janela preta: o que seria impresso vai pra data/tiksoda.log.
export function setupLog() {
  if (!PACKAGED) return;
  const file = path.join(DATA_DIR, 'tiksoda.log');
  try { if (statSync(file).size > 2_000_000) renameSync(file, `${file}.old`); } catch { /* primeira vez */ }
  const write = (level) => (...args) => {
    const line = `[${new Date().toISOString()}] ${level} ${args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
    try { appendFileSync(file, line); } catch { /* sem disco */ }
  };
  console.log = write('INFO');
  console.warn = write('WARN');
  console.error = write('ERRO');
  process.on('uncaughtException', (err) => console.error('Erro inesperado:', err));
  process.on('unhandledRejection', (err) => console.error('Promessa rejeitada:', err));
}

function findEdge() {
  const pf = process.env['PROGRAMFILES'] || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  return [
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].find((p) => existsSync(p)) || null;
}

// Abre o painel. No Windows usa o Edge em "modo app" (janela própria, sem abas
// nem barra de endereço). Sem Edge, abre no navegador padrão.
export function openPanel(url) {
  try {
    if (process.platform === 'win32') {
      const edge = findEdge();
      if (edge) {
        spawn(edge, [`--app=${url}`, '--window-size=1400,900'], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      }
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (err) {
    console.error('Não consegui abrir o painel:', err.message);
  }
}
