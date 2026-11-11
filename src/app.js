import { existsSync, mkdirSync, accessSync, constants, appendFileSync, statSync, renameSync, unlinkSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
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

// Dados:
//  - TIKSODA_DATA, se definido;
//  - rodando pelo Node (iniciar.bat): pasta "data" do projeto;
//  - rodando pelo .exe: pasta "data" ao lado do .exe, se ela já existir (modo portátil),
//    senão %APPDATA%\TikSoda (assim trocar o .exe de lugar ou de versão não perde nada).
function pickDataDir() {
  if (process.env.TIKSODA_DATA) return process.env.TIKSODA_DATA;
  const appData = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'TikSoda');
  if (!PACKAGED) {
    const local = path.join(ROOT, 'data');
    return writable(local) ? local : appData;
  }
  const beside = path.join(path.dirname(process.execPath), 'data');
  if (existsSync(beside) && writable(beside)) return beside;
  return appData;
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

const detach = (child) => {
  child.on('error', (err) => console.error('Não consegui abrir:', err.message));
  child.unref();
};

// Abre uma pasta no Explorer (ou no gerenciador de arquivos).
export function openFolder(dir) {
  const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  try { detach(spawn(cmd, [dir], { detached: true, stdio: 'ignore' })); } catch (err) { console.error(err.message); }
}

// ---------- atalhos do Windows (só no .exe) ----------
const SHORTCUT_DIRS = {
  desktop: () => path.join(os.homedir(), 'Desktop'),
  menu: () => path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  iniciar: () => path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
};
export const shortcutsSupported = () => PACKAGED && process.platform === 'win32';
const shortcutPath = (where) => path.join(SHORTCUT_DIRS[where](), 'TikSoda.lnk');
export function shortcutExists(where) {
  try { return shortcutsSupported() && existsSync(shortcutPath(where)); } catch { return false; }
}
export function setShortcut(where, on) {
  if (!shortcutsSupported()) throw new Error('Atalhos só funcionam no TikSoda.exe do Windows.');
  if (!SHORTCUT_DIRS[where]) throw new Error('Lugar de atalho desconhecido.');
  const lnk = shortcutPath(where);
  if (!on) { try { unlinkSync(lnk); } catch { /* já não existe */ } return false; }
  const script = '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:TS_LNK); $s.TargetPath = $env:TS_EXE; '
    + '$s.WorkingDirectory = $env:TS_DIR; $s.IconLocation = $env:TS_EXE + ",0"; $s.Description = "TikSoda"; $s.Save()';
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    env: { ...process.env, TS_LNK: lnk, TS_EXE: process.execPath, TS_DIR: path.dirname(process.execPath) }, windowsHide: true, timeout: 15000,
  });
  return true;
}

// Abre o painel. No Windows usa o Edge em "modo app" (janela própria, sem abas
// nem barra de endereço). Sem Edge, abre no navegador padrão.
export function openPanel(url) {
  try {
    if (process.platform === 'win32') {
      const edge = findEdge();
      if (edge) {
        detach(spawn(edge, [`--app=${url}`, '--window-size=1400,900'], { detached: true, stdio: 'ignore' }));
      } else {
        detach(spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }));
      }
    } else if (process.platform === 'darwin') {
      detach(spawn('open', [url], { detached: true, stdio: 'ignore' }));
    } else {
      detach(spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }));
    }
  } catch (err) {
    console.error('Não consegui abrir o painel:', err.message);
  }
}
