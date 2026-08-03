import { taxonomy, Kategori } from './taxonomy';
import { Rumpun } from '@/models/node';

export const normalizeLabel = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '');

const kategoriByLabel = new Map<string, string>();
const jenjangByLabel = new Map<string, string>(); // key: `${kategoriId}|${normalizedLabel}`

function allJenjangOfCategory(k: Kategori) {
  if (!k.punyaRumpun) return k.jenjang ?? [];
  return [...(k.rumpun?.keahlian ?? []), ...(k.rumpun?.keterampilan ?? [])];
}

// Populate maps at module load
for (const k of taxonomy.kategori) {
  kategoriByLabel.set(normalizeLabel(k.nama), k.id);
  kategoriByLabel.set(normalizeLabel(k.id), k.id);

  for (const j of allJenjangOfCategory(k)) {
    jenjangByLabel.set(`${k.id}|${normalizeLabel(j.nama)}`, j.id);
    jenjangByLabel.set(`${k.id}|${normalizeLabel(j.singkatan)}`, j.id);
    jenjangByLabel.set(`${k.id}|${normalizeLabel(j.id)}`, j.id);
  }
}

export function resolveKategori(label: string): string | null {
  if (!label) return null;
  return kategoriByLabel.get(normalizeLabel(label)) ?? null;
}

export function resolveJenjang(kategoriId: string, label: string): string | null {
  if (!kategoriId || !label) return null;
  return jenjangByLabel.get(`${kategoriId}|${normalizeLabel(label)}`) ?? null;
}

const rumpunByLabel = new Map<string, Rumpun>([
  ['keahlian', 'keahlian'],
  ['ahli', 'keahlian'],
  ['keterampilan', 'keterampilan'],
  ['terampil', 'keterampilan'],
]);

/**
 * A cell may name one or both tracks ("Keahlian", "Keahlian dan Keterampilan").
 * Unrecognized text resolves to [] rather than throwing, matching the
 * import pipeline's warn-and-continue behavior for unmapped labels.
 */
export function resolveRumpun(label?: string): Rumpun[] {
  if (!label) return [];
  const parts = label.split(/[,/&+]| dan | and /i);
  const result = new Set<Rumpun>();
  for (const part of parts) {
    const norm = normalizeLabel(part);
    const match = rumpunByLabel.get(norm);
    if (match) result.add(match);
  }
  return Array.from(result);
}
