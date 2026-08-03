import rawTaxonomy from './taxonomy.json';
import { NodeType, Rumpun } from '@/models/node';

export interface Jenjang {
  id: string;
  nama: string;
  singkatan: string;
}

export interface Kategori {
  id: string;
  nama: string;
  warna: string;
  punyaRumpun: boolean;
  jenjang?: Jenjang[];
  rumpun?: Record<Rumpun, Jenjang[]>;
}

export interface Taxonomy {
  configVersion: string;
  kategori: Kategori[];
  unitWarna: string;
  labels: Record<NodeType, string>;
}

export const taxonomy: Taxonomy = Object.freeze(rawTaxonomy as unknown as Taxonomy);
