import { describe, it, expect } from 'vitest';
import { taxonomy } from '../src/config/taxonomy';
import {
  getJenjangOptions,
  getKategori,
  jenjangLabel,
  isJenjangValid,
} from '../src/config/resolver';
import { resolveKategori, resolveJenjang } from '../src/config/labels';

describe('Configuration & Taxonomy (Doc 02 Exit Criteria)', () => {
  it('taxonomy.json is loaded once and frozen', () => {
    expect(Object.isFrozen(taxonomy)).toBe(true);
    expect(taxonomy.configVersion).toBe('2026.1');
  });

  it("getJenjangOptions('fungsional', ['keterampilan', 'keahlian']) returns expertise (keahlian) levels first regardless of selection order", () => {
    const options = getJenjangOptions('fungsional', ['keterampilan', 'keahlian']);
    expect(options.length).toBe(8);
    // Expertise levels: ahli_utama, ahli_madya, ahli_muda, ahli_pertama
    expect(options[0].id).toBe('ahli_utama');
    expect(options[1].id).toBe('ahli_madya');
    expect(options[2].id).toBe('ahli_muda');
    expect(options[3].id).toBe('ahli_pertama');
    // Skill levels follow
    expect(options[4].id).toBe('penyelia');
  });

  it("getJenjangOptions('pelaksana') returns [] and isJenjangValid null returns true", () => {
    const options = getJenjangOptions('pelaksana');
    expect(options).toEqual([]);
    expect(isJenjangValid('pelaksana', [], null)).toBe(true);
  });

  it('resolveKategori accepts insensitive labels and whitespace variations', () => {
    expect(resolveKategori('Struktural')).toBe('struktural');
    expect(resolveKategori('struktural')).toBe('struktural');
    expect(resolveKategori('STRUKTURAL ')).toBe('struktural');
    expect(resolveKategori('  Fungsional  ')).toBe('fungsional');
    expect(resolveKategori('Unknown')).toBeNull();
  });

  it('resolveJenjang resolves labels and abbreviations correctly', () => {
    expect(resolveJenjang('struktural', 'JPT Pratama')).toBe('jpt_pratama');
    expect(resolveJenjang('struktural', 'JPT')).toBe('jpt_pratama');
    expect(resolveJenjang('fungsional', 'Ahli Muda')).toBe('ahli_muda');
    expect(resolveJenjang('fungsional', 'AMu')).toBe('ahli_muda');
  });

  it('unknown jenjangId renders bracketed rather than empty string', () => {
    expect(jenjangLabel('ahli_pertama_lama')).toBe('[ahli_pertama_lama]');
    expect(jenjangLabel(null)).toBe('—');
  });
});
