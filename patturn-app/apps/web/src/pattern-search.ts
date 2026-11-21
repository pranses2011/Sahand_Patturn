export function normalizePatternSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660)).replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[\s\u200c-]+/g, ' ').trim();
}
