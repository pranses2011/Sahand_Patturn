export function normalizePatternSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[\s\u200c-]+/g, ' ').trim();
}
