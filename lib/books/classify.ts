import {
  groupsForCodes,
  type BookCategories,
  type CategoryEvidence,
  type ThemaCode,
} from './categories.ts';

// Never classify from a title, author, UI locale, a plot keyword, or an award.
// These are conservative mappings of category paths, not authoritative Thema assignments.
function mapSubject(
  raw: string,
  source: CategoryEvidence['source'],
): ThemaCode[] {
  const s = raw
    .toLowerCase()
    .replace(/\s*>\s*/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .trim()
    .replace('소설/시/희곡/', '');
  if (/추천도서|lexile|reading level|bestseller|award/.test(s)) return [];
  if (source === 'open-library') {
    // Open Library subjects mix topics and genres; accept only explicit forms.
    if (/^(korean |english |french )?essays$/.test(s)) return ['DNL'];
    if (/^(memoirs|autobiography|biography)$/.test(s))
      return [s === 'biography' ? 'DNB' : 'DNC'];
    if (
      /^(science fiction|fantasy fiction|detective and mystery stories|romance fiction)$/.test(
        s,
      )
    ) {
      return [
        s === 'science fiction'
          ? 'FL'
          : s === 'fantasy fiction'
            ? 'FM'
            : s === 'romance fiction'
              ? 'FR'
              : 'FF',
      ];
    }
    return [];
  }
  if (/^(juvenile fiction|young adult fiction)(?:\/|$)/.test(s)) {
    if (/graphic novel|comics/.test(s)) return ['YF', 'XQ'];
    return [/fantasy/.test(s) ? 'YFH' : 'YF'];
  }
  if (/어린이|청소년|유아|juvenile|young adult|children/.test(s)) {
    if (/만화|그래픽노블/.test(s)) return ['YF', 'XQ'];
    if (/동화|소설/.test(s)) return [/판타지/.test(s) ? 'YFH' : 'YF'];
    return [];
  }
  if (/^(cooking|cookbooks)(?:\/|$)|(?:^|\/)요리(?:\/|$)/.test(s)) return ['WB'];
  if (/^crafts & hobbies(?:\/|$)/.test(s)) return ['WF'];
  if (/^sports & recreation(?:\/|$)|^marathon running$/.test(s)) return ['SC'];
  if (/^technology & engineering(?:\/|$)/.test(s)) return ['TB'];
  if (/^computers(?:\/|$)/.test(s)) return ['UB'];
  if (/^(photography|painting)(?:\/|$)/.test(s)) return ['AB'];
  if (/^(astronomy|quantum theory)$/.test(s)) return ['PD'];
  if (/^(korean |english |french )essays$/.test(s)) return ['DNL'];
  if (/그래픽노블|만화|graphic novel|comics/.test(s)) return ['XQ'];
  const fiction = /소설|^fiction(?:\/|$)/.test(s);
  if (fiction) {
    const genres: ThemaCode[] = [];
    if (/추리|미스터리|mystery|detective|crime/.test(s)) genres.push('FF');
    if (/스릴러|thriller|suspense/.test(s)) genres.push('FH');
    if (/(?:^|\/)sf(?:\/|$)|과학소설|science fiction/.test(s))
      genres.push('FL');
    if (/판타지|fantasy/.test(s)) genres.push('FM');
    if (/로맨스|romance/.test(s)) genres.push('FR');
    if (genres.length) return genres;
    // 소설/시/희곡 is a department, not itself proof of fiction.
    if (/\/시\/|^poetry/.test(s)) return ['DCF'];
    if (
      /\/(한국|일본|영미|아일랜드|중국|프랑스|독일|세계의 )?소설|^fiction(?:\/|$)/.test(
        s,
      )
    ) {
      if (/고전|classics/.test(s)) return ['FBC'];
      if (/2000년대 이후|근현대|contemporary/.test(s)) return ['FBA'];
      return ['FB'];
    }
    return [];
  }
  if (/^poetry(?:\/|$)|\/시\//.test(s)) return ['DCF'];
  if (/기독교|christian/.test(s))
    return [/신앙생활|christian living/.test(s) ? 'QRMP' : 'QRM'];
  if (/서양철학|철학 일반|종교철학|^philosophy(?:\/|$)/.test(s)) return ['QD'];
  if (/에세이|(?:^|\/)essays(?:\/|$)/.test(s)) return ['DNL'];
  if (/회고록|memoir/.test(s)) return ['DNC'];
  if (/전기\/자서전|^biography/.test(s)) return ['DNB'];
  if (/홀로코스트|holocaust/.test(s)) return ['NHTZ1'];
  if (/기행|travel writing|travelogue/.test(s)) return ['WTL'];
  if (/역사\/|^history(?:\/|$)/.test(s)) return ['NH'];
  if (/종교\/|종교일반|^religion(?:\/|$)/.test(s)) return ['QR'];
  if (/진화|evolution/.test(s)) return ['PSAJ'];
  if (/^science(?:\/|$)/.test(s)) return ['PD'];
  if (/^art(?:\/|$)|\/미술\//.test(s)) return ['AB'];
  if (/^social science(?:\/|$)/.test(s)) return ['JH'];
  if (/^business & economics(?:\/|$)/.test(s)) return ['KJ'];
  if (/^self-help(?:\/|$)|자기계발\//.test(s)) return ['VS'];
  return [];
}

export function classifySubjects(
  evidence: CategoryEvidence[],
): BookCategories | undefined {
  if (!evidence.length) return undefined;
  const cleaned = evidence
    .slice(0, 8)
    .map((e) => ({
      source: e.source,
      subjects: [
        ...new Set(
          e.subjects
            .filter((s) => typeof s === 'string')
            .map((s) => s.trim().slice(0, 500))
            .filter(Boolean),
        ),
      ].slice(0, 30),
    }))
    .filter((e) => e.subjects.length);
  if (!cleaned.length) return undefined;
  let codes = [
    ...new Set(
      cleaned.flatMap((e) =>
        e.subjects.flatMap((s) => mapSubject(s, e.source)),
      ),
    ),
  ];
  // Avoid ancestor/descendant duplicates; retain multiple supported categories
  // for discovery without requiring a single primary genre.
  codes = codes.filter(
    (c) => !codes.some((other) => other !== c && other.startsWith(c)),
  );
  codes = codes.slice(0, 8);
  return {
    version: 1,
    status: groupsForCodes(codes).length ? 'suggested' : 'review',
    codes,
    evidence: cleaned,
  };
}
