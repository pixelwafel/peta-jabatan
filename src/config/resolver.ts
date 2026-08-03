import { taxonomy, Kategori, Jenjang } from './taxonomy';
import { OrgNode, Rumpun } from '@/models/node';

export function getKategori(id?: string): Kategori | null {
  if (!id) return null;
  return taxonomy.kategori.find(k => k.id === id) ?? null;
}

export function getKategoriList(): Kategori[] {
  return taxonomy.kategori;
}

/**
 * Returns levels valid for this exact combination of category and tracks.
 * Track order is fixed ('keahlian' before 'keterampilan') so chips do not jump.
 */
export function getJenjangOptions(kategoriId?: string, rumpun: Rumpun[] = []): Jenjang[] {
  const k = getKategori(kategoriId);
  if (!k) return [];

  if (!k.punyaRumpun) return k.jenjang ?? [];

  const order: Rumpun[] = ['keahlian', 'keterampilan'];
  return order
    .filter(r => rumpun.includes(r))
    .flatMap(r => k.rumpun?.[r] ?? []);
}

export function getJenjang(kategoriId: string | undefined, jenjangId: string): Jenjang | null {
  const k = getKategori(kategoriId);
  if (!k) {
    // Fallback: search all categories for this jenjangId if category is unmapped
    for (const cat of taxonomy.kategori) {
      const found = allJenjangOfCategory(cat).find(j => j.id === jenjangId);
      if (found) return found;
    }
    return null;
  }

  return allJenjangOfCategory(k).find(j => j.id === jenjangId) ?? null;
}

function allJenjangOfCategory(k: Kategori): Jenjang[] {
  if (!k.punyaRumpun) return k.jenjang ?? [];
  const list: Jenjang[] = [];
  if (k.rumpun?.keahlian) list.push(...k.rumpun.keahlian);
  if (k.rumpun?.keterampilan) list.push(...k.rumpun.keterampilan);
  return list;
}

export function jenjangLabel(jenjangId: string | null, kategoriId?: string): string {
  if (jenjangId === null) return '—';
  const j = getJenjang(kategoriId, jenjangId);
  if (j) return j.nama;
  // Unknown jenjangId renders bracketed rather than empty
  return `[${jenjangId}]`;
}

export function jenjangSingkatan(jenjangId: string | null, kategoriId?: string): string {
  if (jenjangId === null) return '—';
  const j = getJenjang(kategoriId, jenjangId);
  if (j) return j.singkatan;
  return `[${jenjangId}]`;
}

export function kategoriWarna(nodeOrKategoriId: OrgNode | string | undefined): string {
  if (typeof nodeOrKategoriId === 'object' && nodeOrKategoriId !== null) {
    if (nodeOrKategoriId.type === 'unit') return taxonomy.unitWarna;
    const k = getKategori(nodeOrKategoriId.kategoriId);
    return k?.warna ?? taxonomy.unitWarna;
  }
  const k = getKategori(nodeOrKategoriId);
  return k?.warna ?? taxonomy.unitWarna;
}

export function isJenjangValid(
  kategoriId: string | undefined,
  rumpun: Rumpun[],
  jenjangId: string | null
): boolean {
  const options = getJenjangOptions(kategoriId, rumpun);
  if (jenjangId === null) {
    // An unlabeled row is valid only where no levels exist.
    return options.length === 0;
  }
  return options.some(j => j.id === jenjangId);
}
