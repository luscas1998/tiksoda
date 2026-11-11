// Gera dist/TikSoda.exe (Windows x64), um único arquivo com tudo dentro (Node + app).
//   npm run build:exe
// Passos: junta o código num arquivo só (esbuild), baixa o Node base do pkg,
// coloca ícone, nome e versão nele, tira a janela preta (modo janela) e empacota.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ResEdit from 'resedit';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkgJson.version;
const NODE = 'node22';
const BUILD = path.join(ROOT, 'build');
const DIST = path.join(ROOT, 'dist');
const bin = (name) => path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' });

mkdirSync(BUILD, { recursive: true });
mkdirSync(DIST, { recursive: true });

console.log('1/4 Juntando o código…');
run(bin('esbuild'), [
  'src/server.js', '--bundle', '--platform=node', '--format=cjs', '--target=node22', '--minify-syntax',
  `--outfile=${path.join(BUILD, 'tiksoda.cjs')}`,
  '--define:import.meta.url=__tiksoda_url',
  "--banner:js=var __tiksoda_url = require('url').pathToFileURL(__filename).href;",
  '--log-level=warning',
]);

console.log('2/4 Baixando o Node base…');
const cache = path.join(BUILD, 'pkg-cache');
run(bin('pkg-fetch'), ['-n', NODE, '-p', 'win', '-a', 'x64'], { PKG_CACHE_PATH: cache });
const fetched = execFileSync('find', [cache, '-name', 'fetched-*-win-x64', '-type', 'f']).toString().trim().split('\n').filter(Boolean).pop();
if (!fetched) throw new Error('Node base não encontrado no cache do pkg.');

console.log('3/4 Ícone, nome e versão…');
const exe = ResEdit.NtExecutable.from(readFileSync(fetched), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(readFileSync(path.join(ROOT, 'assets', 'icon.ico')));
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, ico.icons.map((i) => i.data));
const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
const [a, b, c] = VERSION.split('.').map(Number);
vi.setFileVersion(a, b, c, 0, 1033);
vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  FileDescription: 'TikSoda', ProductName: 'TikSoda', CompanyName: 'TikSoda',
  OriginalFilename: 'TikSoda.exe', InternalName: 'TikSoda', LegalCopyright: 'Uso pessoal',
  FileVersion: VERSION, ProductVersion: VERSION,
});
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
let base = Buffer.from(exe.generate());
// Subsistema "janela" (2) em vez de "console" (3): abre sem a janela preta.
const pe = base.readUInt32LE(0x3c);
base.writeUInt16LE(2, pe + 0x5c);
const patched = path.join(BUILD, 'node-tiksoda.exe');
writeFileSync(patched, base);

console.log('4/4 Empacotando…');
const out = path.join(DIST, 'TikSoda.exe');
if (existsSync(out)) rmSync(out);
run(bin('pkg'), [path.join(BUILD, 'tiksoda.cjs'), '--config', 'pkg.config.json', '--no-bytecode', '--public-packages', '*', '--public', '--targets', `${NODE}-win-x64`, '--output', out, '--compress', 'Brotli'],
  { PKG_NODE_PATH: patched, PKG_CACHE_PATH: cache });
console.log(`Pronto: ${out}`);
