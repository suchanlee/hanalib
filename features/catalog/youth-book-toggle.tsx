import type { AppLocale } from '@/lib/domain/types';

export function YouthBookToggle({
  locale,
  checked,
  onChange,
}: {
  locale: AppLocale;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        data-testid="youth-book-toggle"
      />
      {locale === 'ko' ? '어린이·청소년 도서' : 'Kids & teens book'}
    </label>
  );
}
