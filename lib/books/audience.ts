/** Audience, not subject matter: books about parenting/children aren't youth books. */
export function youthAudienceEvidence(subjects: readonly string[]): string[] {
  return subjects.filter((raw) => {
    const s = raw
      .toLowerCase()
      .replace(/\s*>\s*/g, '/')
      .replace(/\s*\/\s*/g, '/')
      .trim();
    return (
      /^(juvenile (fiction|nonfiction)|young adult(?: fiction| nonfiction)?|children['’]s (books|literature|stories|fiction)|teen(?:age)? fiction|picture books|board books|early readers)(?:$|\/|,)/.test(
        s,
      ) ||
      /(?:^|[,/]\s*|--\s*)(?:juvenile fiction|juvenile literature|juvenile poetry|young adult fiction)(?:$|[,/])/.test(
        s,
      ) ||
      /^(?:국내도서\/|외국도서\/)?(유아|어린이|아동|청소년)(?:$|\/)/.test(s) ||
      /^(아동|청소년)(문학|소설)(?:$|\/)/.test(s)
    );
  });
}

export function matchesAudience(
  isYouthBook: boolean | undefined,
  filter?: 'all' | 'youth',
) {
  return filter !== 'youth' || isYouthBook === true;
}

// Individually reviewed exact editions whose provider subjects lack audience terms.
// Source records identify a children's graphic novel, a children's history box set,
// and a LeapReader early-reading book respectively. Not a series/title heuristic.
export const reviewedYouthEditions: Readonly<Record<string, string>> = {
  '9780545813891': 'https://openlibrary.org/isbn/9780545813891',
  '9780593089781': 'https://openlibrary.org/books/OL60370716M',
  '9781606852545': 'https://openlibrary.org/books/OL46904158M',
};
