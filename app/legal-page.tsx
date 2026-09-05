import Link from 'next/link';
import Image from 'next/image';

interface LegalSection {
  title: string;
  paragraphs: readonly string[];
}

export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: readonly LegalSection[];
}) {
  return (
    <main className="min-h-dvh bg-background px-5 py-8 text-foreground sm:px-8 sm:py-12">
      <article className="mx-auto w-full max-w-2xl">
        <Link className="inline-flex items-center gap-2.5 font-semibold tracking-tight" href="/">
          <Image src="/seed-logo.svg" alt="" aria-hidden="true" width={36} height={36} className="size-9 shrink-0" />
          <span>도서관 · Books</span>
        </Link>

        <header className="mt-10 border-b pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">{intro}</p>
          <p className="mt-3 text-sm text-muted-foreground">Effective September 4, 2026 · 2026년 9월 4일 시행</p>
        </header>

        <div className="space-y-8 py-8">
          {sections.map((section) => (
            <section className="space-y-3" key={section.title}>
              <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p className="text-[15px] leading-7 text-muted-foreground" key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t py-6 text-sm text-muted-foreground">
          <Link className="underline-offset-4 hover:text-foreground hover:underline" href="/">Home · 홈</Link>
          <Link className="underline-offset-4 hover:text-foreground hover:underline" href="/privacy">Privacy · 개인정보</Link>
          <Link className="underline-offset-4 hover:text-foreground hover:underline" href="/terms">Terms · 이용약관</Link>
        </footer>
      </article>
    </main>
  );
}
