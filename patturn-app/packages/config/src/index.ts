/** Design tokens — "کارگاه سفال" / pottery workshop palette (ADR-005: mm everywhere). */
export const TOKENS = {
  color: {
    bg: '#F7F3EC',
    surface: '#FFFFFF',
    sunken: '#EFE9DF',
    text: '#1C1917',
    textMuted: '#57534E',
    clay: '#C4622D',
    clayDark: '#A94F21',
    plaster: '#3F6C7A',
    success: '#3F7D53',
    warning: '#C9902A',
    danger: '#B3382C',
    // part colors (viewport)
    form: '#C4622D',
    pattern: '#3F6C7A',
    mold: '#B8B0A4',
    key: '#C9902A',
  },
  space: [4, 8, 12, 16, 24, 32, 48, 64, 96] as const,
  radius: { sm: 6, md: 10, lg: 16, full: 9999 } as const,
} as const;

/** Author identity — rule R-013: ONLY source for these values. */
export const AUTHOR = {
  name: 'سعید نجفی',
  nameLatin: 'Saeed Najafi',
  company: 'سهند سرویس',
  companyLatin: 'Sahand Service',
  phone: '09144220430',
  email: 'Pranses2011@GMail.com',
  /** Always display grouped in 4-digit blocks. */
  card: '6219 8619 1893 4679',
  cardRaw: '6219861918934679',
  site: 'EA-Fixer.ir',
  copyright: '© سعید نجفی — سهند سرویس',
} as const;

/** Plans — single source of truth (used by quota enforcement). */
export const PLANS = {
  free: {
    name: 'Free',
    priceMonthly: 0,
    projects: 3,
    segments: 48,
    exportsPerMonth: 10,
    multiPartMold: false,
    mother: false,
    tools: 'core',
  },
  maker: {
    name: 'Maker',
    priceMonthly: 9,
    projects: Infinity,
    segments: 96,
    exportsPerMonth: 200,
    multiPartMold: true,
    mother: true,
    tools: 'all',
  },
  studio: {
    name: 'Studio',
    priceMonthly: 24,
    projects: Infinity,
    segments: 256,
    exportsPerMonth: Infinity,
    multiPartMold: true,
    mother: true,
    tools: 'all+beta',
    teamLibrary: true,
  },
} as const;

export type PlanId = keyof typeof PLANS;

/** Units (iron rule #1: internal unit is always mm). */
export const UNITS = {
  base: 'mm' as const,
  defaultShrink: 0.12,
  defaultWall: 4,
  defaultSegments: 96,
};

/** User-facing names; persisted pattern IDs stay language independent. */
export const PATTERN_NAMES_FA: Record<string, string> = {
  'dot-grid': 'شبکهٔ نقطه‌ای',
  stripes: 'راه‌راه',
  grid: 'شبکهٔ مربعی',
  chevron: 'زیگزاگ',
  hex: 'شش‌ضلعی',
  scale: 'فلس',
  wave: 'موج',
  diamond: 'لوزی',
  spiral: 'مارپیچ',
  seigaiha: 'موج ژاپنی',
  herringbone: 'جناغی',
  kumiko: 'الهام از کومیکو',
};

export * from './number-format.js';
