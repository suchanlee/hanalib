'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Filter, Search, SlidersHorizontal, Sparkles, Star, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useHanaApp } from '@/features/app/app-context';
import { matchesAudience } from '@/lib/books/audience';
import { bookCategoryGroups, categoryGroups, categoryLabels, matchesCategory } from '@/lib/books/categories';
import type { CatalogFilters } from '@/lib/domain/types';
import { copy, memberName } from '@/lib/i18n/copy';
import { BookCover } from './book-cover';
import { catalogCopy, statusLabel } from './catalog-copy';

function FilterFields({
  value,
  onChange,
}: {
  value: CatalogFilters;
  onChange: (next: Partial<CatalogFilters>) => void;
}) {
  const { state } = useHanaApp();
  const t = catalogCopy[state.locale];
  const availableCategories = new Set(
    state.items
      .filter((item) => item.status !== 'archived' && matchesAudience(item.edition.isYouthBook, value.audience))
      .flatMap((item) => {
        const groups = bookCategoryGroups(item.edition.categories);
        return groups.length ? groups : ['uncategorized'];
      }),
  );
  const selectClass = 'w-full [&_select]:h-11 [&_select]:bg-background [&_select]:px-3 [&_select]:text-base';

  return (
    <div className="space-y-5">
      <label className="block text-sm font-medium">
        <span className="mb-2 block">{state.locale === 'ko' ? '분류' : 'Category'}</span>
        <NativeSelect className={selectClass} value={value.category ?? 'all'}
          onChange={(event) => onChange({ category: event.target.value as CatalogFilters['category'] })}
          data-testid="category-filter">
          <NativeSelectOption value="all">{state.locale === 'ko' ? '모든 분류' : 'All categories'}</NativeSelectOption>
          {categoryGroups.filter((group) => availableCategories.has(group.id)).map((group) => <NativeSelectOption key={group.id} value={group.id}>{group[state.locale]}</NativeSelectOption>)}
          {value.category && value.category !== 'all' && !availableCategories.has(value.category) && (
            <NativeSelectOption value={value.category} disabled>
              {categoryGroups.find((group) => group.id === value.category)?.[state.locale] ?? (state.locale === 'ko' ? '미분류·확인 필요' : 'Uncategorized / needs review')}
            </NativeSelectOption>
          )}
          {availableCategories.has('uncategorized') && <NativeSelectOption value="uncategorized">{state.locale === 'ko' ? '미분류·확인 필요' : 'Uncategorized / needs review'}</NativeSelectOption>}
        </NativeSelect>
      </label>

      <label className="block text-sm font-medium">
        <span className="mb-2 block">{t.ownerFilter}</span>
        <NativeSelect
          className={selectClass}
          value={value.ownerId}
          onChange={(event) => onChange({ ownerId: event.target.value })}
          data-testid="owner-filter"
        >
          <NativeSelectOption value="all">{t.allOwners}</NativeSelectOption>
          {state.members.map((member) => (
            <NativeSelectOption key={member.id} value={member.id}>
              {memberName(state.locale, member)}{member.id === state.currentUserId ? ` · ${t.mine}` : ''}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>

      <label className="block text-sm font-medium">
        <span className="mb-2 block">{t.statusFilter}</span>
        <NativeSelect
          className={selectClass}
          value={value.status}
          onChange={(event) => onChange({ status: event.target.value as CatalogFilters['status'] })}
          data-testid="status-filter"
        >
          <NativeSelectOption value="all">{t.allStatuses}</NativeSelectOption>
          <NativeSelectOption value="available">{copy[state.locale].available}</NativeSelectOption>
          <NativeSelectOption value="held">{statusLabel(state.locale, 'held')}</NativeSelectOption>
          <NativeSelectOption value="borrowed">{copy[state.locale].borrowed}</NativeSelectOption>
        </NativeSelect>
      </label>

      <label className="block text-sm font-medium">
        <span className="mb-2 block">{t.languageFilter}</span>
        <NativeSelect
          className={selectClass}
          value={value.language}
          onChange={(event) => onChange({ language: event.target.value as CatalogFilters['language'] })}
          data-testid="language-filter"
        >
          <NativeSelectOption value="all">{t.allLanguages}</NativeSelectOption>
          <NativeSelectOption value="ko">{t.korean}</NativeSelectOption>
          <NativeSelectOption value="en">{t.english}</NativeSelectOption>
          <NativeSelectOption value="other">{t.otherLanguage}</NativeSelectOption>
        </NativeSelect>
      </label>
    </div>
  );
}

export function CatalogView() {
  const { state, actions } = useHanaApp();
  const t = catalogCopy[state.locale];
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<CatalogFilters>(state.filters);
  const activeFilterCount = [state.filters.audience === 'youth', (state.filters.category ?? 'all') !== 'all', state.filters.ownerId !== 'all', state.filters.status !== 'all', state.filters.language !== 'all'].filter(Boolean).length;
  const filterTags: { key: string; label: string; remove: () => void }[] = [];
  if (state.filters.category && state.filters.category !== 'all') {
    const group = categoryGroups.find((group) => group.id === state.filters.category);
    filterTags.push({ key: 'category', label: group?.[state.locale] ?? (state.locale === 'ko' ? '미분류·확인 필요' : 'Uncategorized / needs review'), remove: () => actions.setFilters({ category: 'all' }) });
  }
  if (state.filters.ownerId !== 'all') {
    const owner = state.members.find((member) => member.id === state.filters.ownerId);
    filterTags.push({ key: 'owner', label: `${t.ownerFilter}: ${owner ? memberName(state.locale, owner) : t.owner}`, remove: () => actions.setFilters({ ownerId: 'all' }) });
  }
  if (state.filters.status !== 'all') {
    filterTags.push({ key: 'status', label: statusLabel(state.locale, state.filters.status), remove: () => actions.setFilters({ status: 'all' }) });
  }
  if (state.filters.language !== 'all') {
    filterTags.push({ key: 'language', label: state.filters.language === 'ko' ? t.korean : state.filters.language === 'en' ? t.english : t.otherLanguage, remove: () => actions.setFilters({ language: 'all' }) });
  }
  if (state.searchQuery.trim()) {
    filterTags.push({ key: 'search', label: `“${state.searchQuery.trim()}”`, remove: () => actions.setSearchQuery('') });
  }

  const results = useMemo(() => {
    const query = state.searchQuery.trim().toLocaleLowerCase(state.locale === 'ko' ? 'ko-KR' : 'en-US');
    return state.items.filter((item) => {
      if (item.status === 'archived') return false;
      if (!matchesAudience(item.edition.isYouthBook, state.filters.audience)) return false;
      if (!matchesCategory(item.edition.categories, state.filters.category)) return false;
      if (state.filters.ownerId !== 'all' && item.ownerId !== state.filters.ownerId) return false;
      if (state.filters.status !== 'all' && item.status !== state.filters.status) return false;
      if (state.filters.language !== 'all' && item.edition.language !== state.filters.language) return false;
      if (!query) return true;
      const haystack = [
        item.edition.title,
        item.edition.titleEn,
        ...item.edition.authors,
        ...(item.edition.authorsEn ?? []),
        item.edition.publisher,
        item.edition.isbn13,
        ...categoryLabels(item.edition.categories, 'ko'),
        ...categoryLabels(item.edition.categories, 'en'),
      ].filter(Boolean).join(' ').toLocaleLowerCase(state.locale === 'ko' ? 'ko-KR' : 'en-US');
      return haystack.includes(query);
    });
  }, [state.filters, state.items, state.locale, state.searchQuery]);

  function clearAll() {
    actions.setSearchQuery('');
    actions.setFilters({ ownerId: 'all', status: 'all', language: 'all', category: 'all', audience: 'general' });
    setDraftFilters({ ownerId: 'all', status: 'all', language: 'all', category: 'all', audience: 'general' });
  }

  function openFilters() {
    setDraftFilters(state.filters);
    setFiltersOpen(true);
  }

  function applyFilters() {
    actions.setFilters(draftFilters);
    setFiltersOpen(false);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 sm:pt-8" data-testid="catalog-view">
      <section className="relative mb-6 sm:mb-8">
        <h1 className="flex max-w-xl items-center gap-2 text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
          <span className="grid size-7 shrink-0 place-items-center self-center sm:size-8">
            <BookOpen aria-hidden="true" className="size-6 text-primary sm:size-7" />
          </span>
          <span>{t.title}</span>
          <span className="youth-doodles pointer-events-none relative ml-2 h-10 w-14 shrink-0" aria-hidden="true">
            <Star className="absolute left-0 top-0 size-5 -rotate-12 fill-amber-200 text-amber-600" />
            <Sparkles className="absolute bottom-0 right-0 size-6 rotate-12 text-violet-500" />
          </span>
        </h1>
      </section>

      <section aria-label={state.locale === 'ko' ? '도서 검색과 필터' : 'Book search and filters'}>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={state.searchQuery}
              onChange={(event) => actions.setSearchQuery(event.target.value)}
              placeholder={copy[state.locale].searchPlaceholder}
              aria-label={copy[state.locale].searchPlaceholder}
              className="h-12 rounded-2xl bg-card pl-10 pr-10 shadow-sm"
              data-testid="catalog-search"
            />
            {state.searchQuery ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t.clearSearch}
                onClick={() => actions.setSearchQuery('')}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="relative h-12 rounded-2xl bg-card px-4 shadow-sm"
                  aria-label={t.filter}
                  data-testid="catalog-filter-trigger"
                  onClick={openFilters}
                />
              }
            >
              <SlidersHorizontal className="size-5" />
              <span className="hidden sm:inline">{t.filter}</span>
              {activeFilterCount ? (
                <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[0.65rem] font-semibold text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[88dvh] rounded-t-3xl" data-testid="filters-sheet">
              <SheetHeader className="border-b px-5 pb-4 pt-5">
                <div className="mb-1 flex size-10 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                  <Filter className="size-5" />
                </div>
                <SheetTitle className="text-xl">{t.filters}</SheetTitle>
                <SheetDescription>{t.filterHelp}</SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto px-5 py-2">
                <FilterFields value={draftFilters} onChange={(next) => setDraftFilters((current) => ({ ...current, ...next }))} />
              </div>
              <SheetFooter className="safe-bottom border-t px-5 pt-4 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 sm:flex-1"
                  data-testid="clear-filters"
                  onClick={() => setDraftFilters({ ownerId: 'all', status: 'all', language: 'all', category: 'all', audience: 'general' })}
                >
                  {t.reset}
                </Button>
                <SheetClose
                  render={<Button type="button" className="h-11 sm:flex-1" data-testid="apply-filters" onClick={applyFilters} />}
                >
                  {t.apply}
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2">
            <p className="text-sm font-medium" aria-live="polite">{t.results(results.length)}</p>
          </div>
          <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-3 text-sm font-medium">
            <span><span aria-hidden="true">⭐</span> {state.locale === 'ko' ? '어린이·청소년' : 'Kids & teens'}</span>
            <Switch
              checked={state.filters.audience === 'youth'}
              onCheckedChange={(checked) => {
                const audience = checked ? 'youth' : 'general';
                const category = state.filters.category ?? 'all';
                const categoryExists = state.items.some((item) =>
                  item.status !== 'archived' &&
                  matchesAudience(item.edition.isYouthBook, audience) &&
                  matchesCategory(item.edition.categories, category),
                );
                actions.setFilters({ audience, category: categoryExists ? category : 'all' });
              }}
              data-testid="audience-filter"
            />
          </label>
        </div>
        {filterTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2" aria-label={state.locale === 'ko' ? '적용된 필터' : 'Active filters'}>
            {filterTags.map((tag) => (
              <button
                key={tag.key}
                type="button"
                onClick={tag.remove}
                className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={state.locale === 'ko' ? `${tag.label} 필터 제거` : `Remove ${tag.label} filter`}
                data-testid={`remove-filter-${tag.key}`}
              >
                <span className="min-w-0 break-words">{tag.label}</span>
                <X className="size-3 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>

      {results.length ? (
        <section
          className="mt-4 grid grid-cols-2 items-start gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5"
          aria-label={state.locale === 'ko' ? '검색 결과' : 'Search results'}
          data-testid="catalog-results"
        >
          {results.map((item) => {
            const owner = state.members.find((member) => member.id === item.ownerId);
            const isMine = item.ownerId === state.currentUserId;
            const holdCount = state.holdCounts[item.id] ?? 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => actions.selectItem(item.id)}
                className="group min-w-0 rounded-2xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                data-testid={`catalog-item-${item.id}`}
                aria-label={`${item.edition.title}, ${statusLabel(state.locale, item.status)}`}
              >
                <div className="relative">
                  <BookCover edition={item.edition} className="aspect-[2/3] w-full transition duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_22px_38px_-20px_rgba(15,55,46,0.8)]" />
                  <Badge
                    variant={item.status === 'available' ? 'secondary' : 'outline'}
                    className="absolute bottom-2 left-2 border-white/30 bg-background/90 shadow-sm backdrop-blur"
                  >
                    {statusLabel(state.locale, item.status)}
                  </Badge>
                  {holdCount > 0 ? (
                    <Badge className="absolute right-2 top-2 bg-background/90 text-foreground shadow-sm backdrop-blur" variant="outline">
                      {t.waitingCount(holdCount)}
                    </Badge>
                  ) : null}
                </div>
                <h2 className="mt-3 line-clamp-2 text-[0.95rem] font-semibold leading-snug tracking-[-0.015em] sm:text-base">{item.edition.title}</h2>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.bookBy(item.edition.authors.join(', '))}</p>
                <p className="mt-1.5 line-clamp-1 text-xs font-medium text-primary">
                  {isMine ? t.mine : t.ownedBy(owner ? memberName(state.locale, owner) : '—')}
                </p>
              </button>
            );
          })}
        </section>
      ) : (
        <section className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed bg-card px-6 py-12 text-center" data-testid="catalog-empty">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <Search className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">{t.noResults}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t.noResultsHelp}</p>
          <Button type="button" variant="outline" className="mt-5 h-11" onClick={clearAll}>{t.clearAll}</Button>
        </section>
      )}
    </div>
  );
}
