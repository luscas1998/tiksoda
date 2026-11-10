import { readdirSync, statSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

// Biblioteca de mídia: áudios e vídeos enviados pelo painel ficam em data/midia/.
const AUDIO = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.opus']);
const VIDEO = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const IMAGE = new Set(['.gif', '.png', '.jpg', '.jpeg', '.webp']);

export function mediaKind(file) {
  const ext = path.extname(file).toLowerCase();
  if (AUDIO.has(ext)) return 'audio';
  if (VIDEO.has(ext)) return 'video';
  if (IMAGE.has(ext)) return 'imagem';
  return null;
}

export class MediaLibrary {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'midia');
  }

  ensureDir() {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  list() {
    this.ensureDir();
    return readdirSync(this.dir)
      .filter((f) => mediaKind(f))
      .map((f) => ({ file: f, kind: mediaKind(f), size: statSync(path.join(this.dir, f)).size, url: `/midia/${encodeURIComponent(f)}` }))
      .sort((a, b) => a.file.localeCompare(b.file));
  }

  // Limpa o nome para não sair da pasta nem quebrar URLs.
  safeName(name) {
    const base = path.basename(String(name || ''))
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, '_').slice(0, 80);
    return base && !base.startsWith('.') ? base : '';
  }

  save(name, buffer) {
    const clean = this.safeName(name);
    if (!clean || !mediaKind(clean)) throw new Error('Formato não suportado. Use mp3, wav, ogg, m4a, mp4, webm, mov, gif, png ou jpg.');
    this.ensureDir();
    let file = clean;
    const ext = path.extname(clean);
    for (let i = 2; existsSync(path.join(this.dir, file)); i++) file = `${path.basename(clean, ext)}_${i}${ext}`;
    writeFileSync(path.join(this.dir, file), buffer);
    return { file, kind: mediaKind(file), url: `/midia/${encodeURIComponent(file)}` };
  }

  exists(file) {
    const clean = this.safeName(file);
    return clean === file && existsSync(path.join(this.dir, file));
  }

  remove(file) {
    if (!this.exists(file)) throw new Error('Arquivo não encontrado.');
    unlinkSync(path.join(this.dir, file));
  }
}
