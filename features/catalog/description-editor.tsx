'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  isFullerDescription,
  MAX_DESCRIPTION_LENGTH,
} from '@/lib/books/descriptions';
import { ResolvedBookProvider } from '@/lib/isbn/providers';
import { BookDescription } from './book-description';

export function DescriptionEditor({
  id,
  isbn13,
  locale,
  bookLanguage,
  value,
  onChange,
  allowLookup = true,
}: {
  id: string;
  isbn13: string;
  locale: 'ko' | 'en';
  bookLanguage: 'ko' | 'en' | 'other';
  value: string;
  onChange: (value: string, provenance?: Record<string, string>) => void;
  allowLookup?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [suggestion, setSuggestion] = useState<{
    text: string;
    original: string;
    source?: string;
    scope?: string;
    url?: string;
  }>();
  const ko = locale === 'ko';
  async function findDescription() {
    setLoading(true);
    setSuggestion(undefined);
    setMessage('');
    const original = value;
    try {
      const metadata = await new ResolvedBookProvider().lookup(
        isbn13,
        bookLanguage === 'other' ? locale : bookLanguage,
        undefined,
        'enrich',
      );
      if (isFullerDescription(original, metadata?.description)) {
        const sourceUrl = metadata?.provenance?.descriptionUrl;
        setSuggestion({
          text: metadata!.description!,
          original,
          source: metadata?.provenance?.description,
          scope: metadata?.provenance?.descriptionScope,
          url: sourceUrl?.startsWith('https://') ? sourceUrl : undefined,
        });
      } else {
        setMessage(
          ko
            ? '확인한 자료에서 더 완전한 소개를 찾지 못했어요. 직접 수정할 수 있습니다.'
            : 'No fuller description was found in the available results. You can edit it below.',
        );
      }
    } catch {
      setMessage(
        ko
          ? '소개를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
          : 'Couldn’t check descriptions. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{ko ? '책 소개' : 'Description'}</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={MAX_DESCRIPTION_LENGTH}
        onChange={(event) => {
          onChange(event.target.value);
          setSuggestion(undefined);
          setMessage('');
        }}
        className="min-h-28"
      />
      {allowLookup && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={loading}
          onClick={findDescription}
          data-testid="find-description"
        >
          {ko ? '더 완전한 소개 찾기' : 'Find a fuller description'}
        </Button>
      )}
      {message && (
        <output className="block text-sm text-muted-foreground">
          {message}
        </output>
      )}
      {suggestion && suggestion.original === value && (
        <div
          className="rounded-lg border p-3"
          data-testid="description-suggestion"
        >
          <p className="text-sm font-medium">
            {ko ? '새 소개 미리보기' : 'Description preview'}
          </p>
          {suggestion.source && (
            <p className="text-xs text-muted-foreground">
              {ko ? '출처: ' : 'Source: '}
              {suggestion.url ? (
                <a
                  href={suggestion.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {suggestion.source}
                </a>
              ) : (
                suggestion.source
              )}
            </p>
          )}
          <BookDescription description={suggestion.text} locale={locale} />
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={() => {
              onChange(
                suggestion.text,
                suggestion.source
                  ? {
                      description: suggestion.source,
                      ...(suggestion.url
                        ? { descriptionUrl: suggestion.url }
                        : {}),
                      ...(suggestion.scope
                        ? { descriptionScope: suggestion.scope }
                        : {}),
                    }
                  : undefined,
              );
              setSuggestion(undefined);
            }}
          >
            {ko ? '이 소개 사용' : 'Use this description'}
          </Button>
        </div>
      )}
    </div>
  );
}
