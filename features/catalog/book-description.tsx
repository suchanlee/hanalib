'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppLocale } from '@/lib/domain/types';
import { catalogCopy } from './catalog-copy';

export function BookDescription({ description, locale }: { description: string; locale: AppLocale }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const descriptionId = useId();
  const t = catalogCopy[locale];

  useEffect(() => {
    const paragraph = paragraphRef.current;
    if (!paragraph) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(paragraph).lineHeight);
      setOverflows(paragraph.scrollHeight > lineHeight * 3 + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [description]);

  return (
    <div className="mt-3 max-w-2xl">
      <p
        ref={paragraphRef}
        id={descriptionId}
        className={`whitespace-pre-line text-sm leading-relaxed text-muted-foreground ${expanded ? '' : 'max-h-[3lh] overflow-hidden'}`}
        style={!expanded && overflows ? { maskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)' } : undefined}
      >
        {description}
      </p>
      {overflows ? (
        <Button
          type="button"
          variant="ghost"
          className="mx-auto mt-1 flex h-8 w-fit px-5 text-primary"
          aria-expanded={expanded}
          aria-controls={descriptionId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t.collapseDescription : t.expandDescription}
          {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </Button>
      ) : null}
    </div>
  );
}
