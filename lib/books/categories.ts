// A deliberately small browsing vocabulary mapped to Thema 1.6. UI labels are our
// translations, not a replacement for the official Thema headings/scope notes.
export const categoryGroups = [
  { id: 'fiction', code: 'FB', en: 'Fiction & literature', ko: '소설·문학' },
  { id: 'mystery', code: 'FF', en: 'Mystery & crime', ko: '추리·미스터리' },
  { id: 'thriller', code: 'FH', en: 'Thrillers', ko: '스릴러' },
  { id: 'science-fiction', code: 'FL', en: 'Science fiction', ko: 'SF' },
  { id: 'fantasy', code: 'FM', en: 'Fantasy', ko: '판타지' },
  { id: 'romance', code: 'FR', en: 'Romance', ko: '로맨스' },
  { id: 'poetry', code: 'DCF', en: 'Poetry', ko: '시' },
  { id: 'essays', code: 'DNL', en: 'Essays', ko: '에세이' },
  {
    id: 'comics',
    code: 'XQ',
    en: 'Comics & graphic novels',
    ko: '만화·그래픽노블',
  },
  { id: 'biography', code: 'DNB', en: 'Biography & memoir', ko: '전기·회고록' },
  { id: 'history', code: 'NH', en: 'History', ko: '역사' },
  { id: 'philosophy', code: 'QD', en: 'Philosophy', ko: '철학' },
  { id: 'religion', code: 'QR', en: 'Religion & faith', ko: '종교·신앙' },
  { id: 'art', code: 'AB', en: 'Arts', ko: '예술' },
  { id: 'travel', code: 'WTL', en: 'Travel writing', ko: '기행문' },
  { id: 'science', code: 'PD', en: 'Science', ko: '과학' },
  { id: 'society', code: 'JH', en: 'Society', ko: '사회' },
  { id: 'business', code: 'KJ', en: 'Business', ko: '경영' },
  { id: 'cooking', code: 'WB', en: 'Food & cooking', ko: '요리·음식' },
  { id: 'crafts', code: 'WF', en: 'Crafts & hobbies', ko: '공예·취미' },
  { id: 'sports', code: 'SC', en: 'Sports', ko: '스포츠' },
  { id: 'technology', code: 'TB', en: 'Technology & engineering', ko: '기술·공학' },
  { id: 'computing', code: 'UB', en: 'Computing', ko: '컴퓨터·IT' },
  { id: 'self-help', code: 'VS', en: 'Personal development', ko: '자기계발' },
] as const;

export type CategoryId = (typeof categoryGroups)[number]['id'];
export const themaCodes = [
  'WB', 'WF', 'SC', 'TB', 'UB', 'YF', 'YFH',
  'FB',
  'FBA',
  'FBC',
  'FF',
  'FH',
  'FL',
  'FM',
  'FR',
  'FYB',
  'DCF',
  'DNL',
  'DNB',
  'DNC',
  'NH',
  'NHTB',
  'NHTZ1',
  'QD',
  'QR',
  'QRM',
  'QRMP',
  'AB',
  'WTL',
  'PD',
  'PSAJ',
  'JH',
  'KJ',
  'VS',
  'XQ',
] as const;
export type ThemaCode = (typeof themaCodes)[number];
export interface CategoryEvidence {
  source: 'aladin' | 'google-books' | 'open-library' | 'audit';
  subjects: string[];
}
export interface BookCategories {
  version: 1;
  status: 'suggested' | 'review' | 'confirmed';
  codes: ThemaCode[];
  evidence: CategoryEvidence[];
}

export function validCategoryCodes(value: unknown): value is ThemaCode[] {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    new Set(value).size === value.length &&
    value.every(
      (code) =>
        typeof code === 'string' && themaCodes.includes(code as ThemaCode),
    )
  );
}

export function validBookCategories(value: unknown): value is BookCategories {
  if (!value || typeof value !== 'object') return false;
  const c = value as BookCategories;
  return (
    c.version === 1 &&
    ['suggested', 'review', 'confirmed'].includes(c.status) &&
    validCategoryCodes(c.codes) &&
    Array.isArray(c.evidence) &&
    c.evidence.length <= 8 &&
    c.evidence.every(
      (e) =>
        e &&
        ['aladin', 'google-books', 'open-library', 'audit'].includes(
          e.source,
        ) &&
        Array.isArray(e.subjects) &&
        e.subjects.length <= 30 &&
        e.subjects.every((s) => typeof s === 'string' && s.length <= 500),
    )
  );
}

export function parseBookCategories(
  value: string | null | undefined,
): BookCategories | undefined {
  try {
    const parsed: unknown = JSON.parse(value ?? 'null');
    return validBookCategories(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function confirmCategories(
  codes: ThemaCode[],
  previous?: BookCategories,
): BookCategories {
  return {
    version: 1,
    status: 'confirmed',
    codes,
    evidence: previous?.evidence ?? [],
  };
}

export function groupsForCodes(codes: readonly ThemaCode[]): CategoryId[] {
  const ids = new Set<CategoryId>();
  for (const code of codes) {
    if (code.startsWith('YF')) ids.add('fiction');
    if (code === 'YFH') ids.add('fantasy');
    if (code.startsWith('F') && code !== 'FYB') ids.add('fiction');
    const direct = categoryGroups.find((group) => group.code === code);
    if (direct) ids.add(direct.id);
    if (code === 'DNC') ids.add('biography');
    if (code.startsWith('NH')) ids.add('history');
    if (code.startsWith('QR')) ids.add('religion');
    if (code === 'PSAJ') ids.add('science');
  }
  return categoryGroups
    .filter((group) => ids.has(group.id))
    .map((group) => group.id);
}

export function bookCategoryGroups(categories?: BookCategories): CategoryId[] {
  return categories?.status === 'review'
    ? []
    : groupsForCodes(categories?.codes ?? []);
}

export function matchesCategory(
  categories: BookCategories | undefined,
  filter: CategoryId | 'all' | 'uncategorized' = 'all',
) {
  const groups = bookCategoryGroups(categories);
  return (
    filter === 'all' ||
    (filter === 'uncategorized' ? groups.length === 0 : groups.includes(filter))
  );
}

export function categoryLabels(
  categories: BookCategories | undefined,
  locale: 'ko' | 'en',
) {
  const groups = bookCategoryGroups(categories);
  return categoryGroups
    .filter((group) => groups.includes(group.id))
    .map((group) => group[locale]);
}
