#!/usr/bin/env node
// Fase 2.1b — pengganti ringan untuk ESLint no-restricted-imports (ESLint
// belum terpasang di project ini; lihat catatan di dalam PR/commit).
//
// Menegakkan aturan layering docs/00-architecture (models -> schema ->
// selectors (murni) -> store -> components; persistence di samping store):
// `src/selectors/**` dan `src/workers/**` TIDAK BOLEH mengimpor dari
// `@/store/*` atau `@/components/*`. Pelanggaran di sini persis yang dulu
// membuat selectors/linkResolver.ts & selectors/recap.ts tidak bisa dipakai
// di Web Worker (Fase 2.1 memperbaikinya) — skrip ini supaya regresi serupa
// ketahuan sebelum sempat menyebar, bukan ditemukan lagi lewat 11 test yang
// tiba-tiba merah.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const GUARDED_DIRS = ['src/selectors', 'src/workers'];
const FORBIDDEN_PATTERNS = [
  { pattern: /from\s+['"]@\/store\//, label: "'@/store/*'" },
  { pattern: /from\s+['"]@\/components\//, label: "'@/components/*'" },
];

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files; // directory doesn't exist yet (mis. src/workers sebelum Fase 2.2) — bukan error
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];

for (const guardedDir of GUARDED_DIRS) {
  const absDir = join(rootDir, guardedDir);
  for (const file of walk(absDir)) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      for (const { pattern, label } of FORBIDDEN_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({
            file: relative(rootDir, file).replace(/\\/g, '/'),
            line: i + 1,
            label,
            text: line.trim(),
          });
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error('❌ Pelanggaran layering ditemukan — selectors/workers harus bebas-store & bebas-DOM:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — mengimpor dari ${v.label}`);
    console.error(`    ${v.text}`);
  }
  console.error(
    `\n${violations.length} pelanggaran. src/selectors/** dan src/workers/** tidak boleh mengimpor dari @/store/* atau @/components/* — modul ini harus tetap dipanggil dari Web Worker (Fase 2.2). Kalau butuh menulis balik ke store dari dalam selector (mis. side effect), pakai pola injeksi seperti selectors/linkResolver.ts setLiveResolveHandler + store/linkCacheRefresh.ts.`
  );
  process.exit(1);
}

console.log(`✓ Layering OK — ${GUARDED_DIRS.join(', ')} bebas dari impor @/store & @/components.`);
