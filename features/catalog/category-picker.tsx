'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  categoryGroups,
  groupsForCodes,
  type BookCategories,
  type ThemaCode,
} from '@/lib/books/categories';

export function CategoryPicker({
  locale,
  codes,
  status,
  onChange,
}: {
  locale: 'ko' | 'en';
  codes: ThemaCode[];
  status?: BookCategories['status'];
  onChange: (codes: ThemaCode[]) => void;
}) {
  const ko = locale === 'ko';
  // Parent browsing groups need not be explicitly assigned alongside a genre.
  const belongs = (code: ThemaCode, group: (typeof categoryGroups)[number]) =>
    group.id === 'fiction'
      ? code.startsWith('FB')
      : groupsForCodes([code]).includes(group.id);
  const usable = codes;
  return (
    <fieldset className="space-y-3" data-testid="category-picker">
      <legend className="text-sm font-medium">
        {ko ? '분류' : 'Categories'}
      </legend>
      <p className="text-sm text-muted-foreground">
        {ko
          ? '여러 분류를 선택할 수 있어요. 선택한 각 분류에서 책을 찾을 수 있습니다.'
          : 'Choose multiple categories. This book will appear in each selected category.'}
      </p>
      {status !== 'confirmed' && (
        <p className="text-sm text-muted-foreground">
          {ko
            ? '책에 맞는 분류를 확인하거나 선택해 주세요.'
            : 'Review the suggestions or choose categories for this book.'}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {categoryGroups.map((group) => {
          const checked = usable.some((c) => belongs(c, group));
          return (
            <label
              key={group.id}
              className="flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <Checkbox
                checked={checked}
                disabled={!checked && usable.length >= 8}
                onCheckedChange={(next) => {
                  let selection = usable.filter((c) => !belongs(c, group));
                  if (next) selection.push(group.code);
                  if (!selection.some((c) => c.startsWith('F') && c !== 'FYB'))
                    selection = selection.filter((c) => c !== 'FYB');
                  onChange(selection);
                }}
              />
              {group[locale]}
            </label>
          );
        })}
      </div>
      {status !== 'confirmed' && usable.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(usable)}
        >
          {ko ? '이 분류로 확인' : 'Confirm these categories'}
        </Button>
      )}
    </fieldset>
  );
}
