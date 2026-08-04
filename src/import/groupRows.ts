import { Finding } from '@/models/derived';
import { NodeType, Rumpun, Rincian, KepalaUnit } from '@/models/node';
import { RawRow, coerceInt } from './rowParser';
import {
  resolveKategori,
  resolveRumpun,
  resolveJenjang,
} from '@/config/labels';
import { uuid } from '@/utils/uuid';

export interface NodeCandidate {
  nomor: string;
  nama: string;
  tipe: NodeType;
  kategoriId?: string;
  rumpun: Rumpun[];
  rincian: Rincian[];
  kode?: string;
  unitKerja?: string;
  keterangan?: string;
  kepalaUnit?: KepalaUnit;
  custom: Record<string, string>;
  rowNumbers: number[];
}

function resolveTipe(s?: string): NodeType | null {
  if (!s) return null;
  const norm = s.trim().toLowerCase();
  if (norm === 'unit' || norm === 'u' || norm === 'organisasi') return 'unit';
  if (norm === 'jabatan' || norm === 'j' || norm === 'posisi') return 'jabatan';
  return null;
}

function inferTipe(r: RawRow): NodeType {
  if (r.kategori || r.jenjang || Number(r.kebutuhan) || Number(r.eksisting)) {
    return 'jabatan';
  }

  const unitWords =
    /^(sekretariat|bidang|sub ?bidang|sub ?bagian|bagian|seksi|uptd|upt|balai|dinas|badan|satuan|inspektorat)\b/i;

  if (unitWords.test(r.nama.trim())) {
    return 'unit';
  }

  return 'jabatan';
}

function num(val?: string): number {
  if (!val) return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

export function groupRows(rows: RawRow[]): {
  candidates: NodeCandidate[];
  findings: Finding[];
} {
  const groups = new Map<string, RawRow[]>();
  for (const r of rows) {
    const list = groups.get(r.nomor) ?? [];
    list.push(r);
    groups.set(r.nomor, list);
  }

  const candidates: NodeCandidate[] = [];
  const findings: Finding[] = [];

  for (const [nomor, group] of groups.entries()) {
    const first = group[0];

    // Conflict check: same nomor with different names
    const names = new Set(group.map(r => r.nama.toLowerCase()));
    if (names.size > 1) {
      findings.push({
        code: 'IMPORT_NOMOR_CONFLICT',
        severity: 'warning',
        rowNumber: first.rowNumber,
        message: `Nomor ${nomor} dipakai oleh nama berbeda (${Array.from(names).join(
          ', '
        )}). Digabung menjadi satu node bernama "${first.nama}".`,
      });
    }

    const tipe = resolveTipe(first.tipe) ?? inferTipe(first);
    const kategoriId =
      tipe === 'jabatan' ? resolveKategori(first.kategori ?? '') ?? undefined : undefined;

    // Rumpun is union across the group
    const rumpunSet = new Set<Rumpun>();
    for (const r of group) {
      const resolved = resolveRumpun(r.rumpun ?? '');
      for (const item of resolved) rumpunSet.add(item);
    }
    const rumpun = Array.from(rumpunSet);

    // Unit rows carrying figures: report and discard (Invariant 1)
    if (tipe === 'unit' && group.some(r => num(r.kebutuhan) || num(r.eksisting))) {
      findings.push({
        code: 'IMPORT_UNIT_HAS_FIGURES',
        severity: 'warning',
        rowNumber: first.rowNumber,
        message: `Baris ${first.rowNumber}: "${first.nama}" bertipe Unit, angkanya diabaikan karena angka unit dihitung dari jabatan di bawahnya.`,
      });
    }

    const rincian: Rincian[] =
      tipe === 'unit'
        ? []
        : group.map(r => {
            const jenjangId = r.jenjang
              ? resolveJenjang(kategoriId ?? '', r.jenjang)
              : null;

            if (r.jenjang && !jenjangId) {
              findings.push({
                code: 'IMPORT_BAD_JENJANG',
                severity: 'warning',
                rowNumber: r.rowNumber,
                message: `Baris ${r.rowNumber}: jenjang "${r.jenjang}" tidak dikenal untuk kategori ini. Dikosongkan.`,
              });
            }

            return {
              id: uuid(),
              jenjangId,
              kebutuhan: coerceInt(r.kebutuhan, r.rowNumber, 'kebutuhan', findings),
              eksisting: coerceInt(r.eksisting, r.rowNumber, 'eksisting', findings),
            };
          });

    let kepalaUnit: KepalaUnit | undefined;
    if (
      tipe === 'unit' &&
      (first.kepalaNama || first.kepalaKode || first.kepalaJenjang ||
        first.kepalaKebutuhan || first.kepalaEksisting)
    ) {
      const jenjangId = first.kepalaJenjang
        ? resolveJenjang('struktural', first.kepalaJenjang)
        : null;

      if (first.kepalaJenjang && !jenjangId) {
        findings.push({
          code: 'IMPORT_BAD_JENJANG',
          severity: 'warning',
          rowNumber: first.rowNumber,
          message: `Baris ${first.rowNumber}: jenjang kepala unit "${first.kepalaJenjang}" tidak dikenal. Dikosongkan.`,
        });
      }

      kepalaUnit = {
        nama: first.kepalaNama || undefined,
        kode: first.kepalaKode || undefined,
        jenjangId,
        kebutuhan: coerceInt(first.kepalaKebutuhan, first.rowNumber, 'kepala_kebutuhan', findings),
        eksisting: coerceInt(first.kepalaEksisting, first.rowNumber, 'kepala_eksisting', findings),
      };
    }

    candidates.push({
      nomor,
      nama: first.nama,
      tipe,
      kategoriId,
      rumpun,
      rincian,
      kode: first.kode,
      unitKerja: first.unitKerja,
      keterangan: first.keterangan,
      kepalaUnit,
      custom: first.custom,
      rowNumbers: group.map(r => r.rowNumber),
    });
  }

  return { candidates, findings };
}
