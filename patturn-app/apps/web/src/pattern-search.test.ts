import { describe, expect, it } from 'vitest';
import { filterPatterns, normalizePatternSearch } from './PatternLibrary';
import { PATTERNS } from '@patturn/patterns';

describe('Local pattern search',()=>{
  it('returns all patterns in original order for blank input',()=>{
    expect(filterPatterns('  ')).toEqual(PATTERNS);
  });
  it('matches Persian names despite Arabic letter variants and marks',()=>{
    expect(filterPatterns('كُوميكو').map((p)=>p.id)).toEqual(['kumiko']);
    expect(normalizePatternSearch('شَبكه‌ي')).toBe('شبکه ی');
  });
  it('matches case-insensitive ids with hyphens treated as spaces',()=>{
    expect(filterPatterns('DOT GRID').map((p)=>p.id)).toEqual(['dot-grid']);
    expect(filterPatterns('seigaiha').map((p)=>p.id)).toEqual(['seigaiha']);
  });
  it('requires every query word and does not interpret query as markup or regex',()=>{
    expect(filterPatterns('kumiko wave')).toEqual([]);
    expect(filterPatterns('<script>')).toEqual([]);expect(filterPatterns('.*')).toEqual([]);
  });
});
