export const MAX_DESCRIPTION_LENGTH = 50_000;

/** Plain text for storage/rendering; keep paragraph boundaries from provider HTML. */
export function cleanDescription(value?: string | null): string | undefined {
  const text = value
    ?.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi,
      (entity) => {
        const named: Record<string, string> = {
          '&amp;': '&',
          '&quot;': '"',
          '&apos;': "'",
          '&lt;': '<',
          '&gt;': '>',
          '&nbsp;': ' ',
        };
        if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
        const code = entity.toLowerCase().startsWith('&#x')
          ? Number.parseInt(entity.slice(3, -1), 16)
          : Number.parseInt(entity.slice(2, -1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
      },
    )
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || undefined;
}

export function descriptionLanguage(text: string): 'ko' | 'en' | undefined {
  if (/[\uac00-\ud7a3]/.test(text)) return 'ko';
  // Do not label other writing systems English merely because a credit or ISBN uses Latin text.
  if (
    /[\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Arabic}]/u.test(
      text,
    )
  )
    return undefined;
  if (
    text.length >= 80 &&
    !/\b(?:the|an|and|with|this|that|from|his|her|their|which|about|book|story|novel|of|for|is|in)\b/i.test(
      text,
    )
  )
    return undefined;
  if (/[a-z]/i.test(text)) return 'en';
  return undefined;
}

export type DescriptionQuality =
  | 'missing'
  | 'invalid'
  | 'note'
  | 'snippet'
  | 'summary'
  | 'substantive';

const qualityRank: Record<DescriptionQuality, number> = {
  missing: 0,
  invalid: 0,
  note: 1,
  snippet: 2,
  summary: 3,
  substantive: 4,
};

/** A diagnostic, not a claim that publisher text is complete. In particular,
 * long descriptions often end with lists or review credits without punctuation. */
export function assessDescription(value?: string | null) {
  const text = cleanDescription(value);
  let quality: DescriptionQuality = 'missing';
  let reason = 'No description';
  if (text) {
    if (text.length > MAX_DESCRIPTION_LENGTH) {
      quality = 'invalid';
      reason = 'Exceeds supported length';
    } else if (
      text.length < 400 &&
      (/^(?:originally published|first published|previously published|includes bibliograph|title from|translation of|copyright|available (?:in|from))\b/i.test(
        text,
      ) ||
        /(?:--|—|–)\s*(?:front cover|back cover|cover|title page)\.?$/i.test(
          text,
        ) ||
        /^(?:책 소개(?:가)? 없|등록된 (?:책 )?소개가 없|소개 준비 중|no (?:book )?description)/i.test(
          text,
        ))
    ) {
      quality = 'note';
      reason = 'Catalog note or placeholder, not a synopsis';
    } else if (
      /(?:\.{3}|…)\s*$/.test(text) ||
      (text.length >= 200 &&
        text.length <= 320 &&
        !/[.!?。！？][”’"')\]]*\s*$/.test(text))
    ) {
      quality = 'snippet';
      reason = 'Ellipsis or an unfinished ending near common snippet limits';
    } else {
      quality = text.length >= 320 ? 'substantive' : 'summary';
      reason =
        quality === 'substantive'
          ? 'Substantial description'
          : 'Short description';
    }
  }
  return {
    text,
    quality,
    reason,
    language: text ? descriptionLanguage(text) : undefined,
  };
}

export function looksTruncated(text: string): boolean {
  return assessDescription(text).quality === 'snippet';
}

/** Used for suggestions, never as authorization to overwrite an owner's text. */
export function descriptionImprovement(
  current?: string | null,
  candidate?: string | null,
) {
  const before = assessDescription(current);
  const after = assessDescription(candidate);
  const reject = (reason: string) => ({ eligible: false, reason });
  if (!after.text || ['invalid', 'note'].includes(after.quality))
    return reject('No usable candidate');
  if (!before.text)
    return { eligible: true, reason: 'Fills a missing description' };
  if (before.text === after.text) return reject('Same description');
  if (!before.language || !after.language || before.language !== after.language)
    return reject('Description language differs or is unknown');
  const prefix = before.text.replace(/(?:\.{3}|…)\s*$/, '').replace(/\s+/g, '');
  if (
    after.text.replace(/\s+/g, '').startsWith(prefix) &&
    after.text.length > before.text.length
  ) {
    return { eligible: true, reason: 'Extends the existing description' };
  }
  if (
    before.quality === 'note' &&
    ['summary', 'substantive'].includes(after.quality) &&
    after.text.length >= 80
  ) {
    return {
      eligible: true,
      reason: 'Replaces a catalog note with a synopsis',
    };
  }
  if (
    before.quality === 'snippet' &&
    ['summary', 'substantive'].includes(after.quality) &&
    after.text.length >= 120
  ) {
    return {
      eligible: true,
      reason: 'Offers a synopsis instead of a likely cut-off snippet',
    };
  }
  if (
    before.quality === 'summary' &&
    after.quality === 'substantive' &&
    after.text.length >=
      Math.max(before.text.length * 1.5, before.text.length + 120)
  ) {
    return {
      eligible: true,
      reason: 'Offers substantially more detail than a short summary',
    };
  }
  return reject('No clear improvement');
}

export function isFullerDescription(
  current?: string,
  candidate?: string,
): boolean {
  return descriptionImprovement(current, candidate).eligible;
}

export function bestDescription<
  T extends { source: string; description?: string },
>(candidates: T[], language: 'ko' | 'en', sourceOrder: readonly string[]) {
  return candidates
    .flatMap((candidate) => {
      const assessment = assessDescription(candidate.description);
      return assessment.text && assessment.quality !== 'invalid'
        ? [
            {
              value: assessment.text,
              source: candidate.source,
              candidate,
              assessment,
            },
          ]
        : [];
    })
    .sort((a, b) => {
      const languageDifference =
        Number(b.assessment.language === language) -
        Number(a.assessment.language === language);
      if (languageDifference) return languageDifference;
      const qualityDifference =
        qualityRank[b.assessment.quality] - qualityRank[a.assessment.quality];
      if (qualityDifference) return qualityDifference;
      if (a.value.length !== b.value.length)
        return b.value.length - a.value.length;
      const rank = (source: string) => {
        const index = sourceOrder.indexOf(source);
        return index < 0 ? sourceOrder.length : index;
      };
      return rank(a.source) - rank(b.source);
    })[0];
}
