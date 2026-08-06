import { get, set } from 'idb-keyval';
import { customStore } from './storage';
import { OpdEntry } from '@/config/daftarOpd';

const CUSTOM_OPD_KEY = 'pjb:v1:ui';

interface UiPersisted {
  customOpdList?: OpdEntry[];
}

/**
 * Entri OPD kustom yang ditambahkan operator sendiri (docs/14-recap-dashboard.md
 * §1.1 — "Pengaturan Dashboard > Tambah OPD Khusus" / "Daftarkan sebagai OPD
 * Resmi"), disimpan terpisah dari `daftar-opd.json` bawaan supaya update
 * aplikasi tidak menimpanya.
 */
export async function getCustomOpdList(): Promise<OpdEntry[]> {
  const raw = await get<UiPersisted>(CUSTOM_OPD_KEY, customStore);
  return raw?.customOpdList ?? [];
}

export async function addCustomOpdEntry(entry: OpdEntry): Promise<OpdEntry[]> {
  const current = await getCustomOpdList();
  if (current.some(e => e.kode === entry.kode)) return current; // sudah ada, no-op

  const next = [...current, entry];
  const raw = (await get<UiPersisted>(CUSTOM_OPD_KEY, customStore)) ?? {};
  await set(CUSTOM_OPD_KEY, { ...raw, customOpdList: next }, customStore);
  return next;
}

export async function removeCustomOpdEntry(kode: string): Promise<OpdEntry[]> {
  const current = await getCustomOpdList();
  const next = current.filter(e => e.kode !== kode);
  const raw = (await get<UiPersisted>(CUSTOM_OPD_KEY, customStore)) ?? {};
  await set(CUSTOM_OPD_KEY, { ...raw, customOpdList: next }, customStore);
  return next;
}
