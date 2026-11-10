import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';

// Arquivo JSON simples em data/, com gravação segura (escreve num .tmp e renomeia).
export class JsonStore {
  constructor(dataDir, name, fallback) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, name);
    this.fallback = fallback;
    this.data = this.load();
  }

  load() {
    try { return JSON.parse(readFileSync(this.file, 'utf8')); } catch { return structuredClone(this.fallback); }
  }

  save() {
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }
}
