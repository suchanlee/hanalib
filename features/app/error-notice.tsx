'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppLocale } from '@/lib/domain/types';
import { issueDetails, issueMessage, type UserIssue } from './user-issue';

export function ErrorNotice({
  issue,
  locale,
  onRetry,
  onDismiss,
}: {
  issue: UserIssue;
  locale: AppLocale;
  onRetry?: () => Promise<void>;
  onDismiss?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const ko = locale === 'ko';
  const details = issueDetails(issue);
  async function copy() {
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  }
  async function retry() {
    setBusy(true);
    try {
      await onRetry?.();
    } catch {
      /* The caller replaces the visible issue. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-destructive/40 bg-background p-4 text-sm shadow-lg"
      data-testid="app-error"
    >
      <div role="alert" className="flex items-start gap-2">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-destructive"
        />
        <p>{issueMessage(issue, locale)}</p>
      </div>
      <details open={copyFailed}>
        <summary className="cursor-pointer font-medium">
          {ko
            ? '운영자에게 보낼 오류 정보'
            : 'Details to send to the organizer'}
        </summary>
        <pre className="mt-2 select-text overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
          {details}
        </pre>
        {copyFailed && (
          <output className="mt-2 block">
            {ko
              ? '자동 복사가 안 돼요. 위 정보를 선택해서 복사하거나 화면을 캡처해 주세요.'
              : 'Automatic copy is unavailable. Select the details above to copy them, or take a screenshot.'}
          </output>
        )}
      </details>
      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={retry}
          >
            {busy
              ? ko
                ? '불러오는 중…'
                : 'Loading…'
              : ko
                ? '도서관 새로고침'
                : 'Refresh library'}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={copy}
        >
          {copied
            ? ko
              ? '복사했어요'
              : 'Copied'
            : ko
              ? '오류 정보 복사'
              : 'Copy error details'}
        </Button>
        {onDismiss && (
          <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
            {ko ? '닫기' : 'Dismiss'}
          </Button>
        )}
      </div>
    </section>
  );
}
