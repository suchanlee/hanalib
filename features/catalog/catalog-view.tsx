'use client';

import { useMemo, useState } from 'react';
import { Filter, Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const selectClass = 'h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/30';

  return (
    <div className="space-y-5">
      <label className="block space-y-2 text-sm font-medium">
        <span>{t.ownerFilter}</span>
        <select
          className={selectClass}
          value={value.ownerId}
          onChange={(event) => onChange({ ownerId: event.target.value })}
          data-testid="owner-filter"
        >
          <option value="all">{t.allOwners}</option>
          {state.members.map((member) => (
            <option key={member.id} value={member.id}>
              {memberName(state.locale, member)}{member.id === state.currentUserId ? ` · ${t.mine}` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-2 text-sm font-medium">
        <span>{t.statusFilter}</span>
        <select
          className={selectClass}
          value={value.status}
          onChange={(event) => onChange({ status: event.target.value as CatalogFilters['status'] })}
          data-testid="status-filter"
        >
          <option value="all">{t.allStatuses}</option>
          <option value="available">{copy[state.locale].available}</option>
          <option value="borrowed">{copy[state.locale].borrowed}</option>
        </select>
      </label>

      <label className="block space-y-2 text-sm font-medium">
        <span>{t.languageFilter}</span>
        <select
          className={selectClass}
          value={value.language}
          onChange={(event) => onChange({ language: event.target.value as CatalogFilters['language'] })}
          data-testid="language-filter"
        >
          <option value="all">{t.allLanguages}</option>
          <option value="ko">{t.korean}</option>
          <option value="en">{t.english}</option>
          <option value="other">{t.otherLanguage}</option>
        </select>
      </label>
    </div>
  );
}

export function CatalogView() {
  const { state, actions } = useHanaApp();
  const t = catalogCopy[state.locale];
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<CatalogFilters>(state.filters);
  const activeFilterCount = [state.filters.ownerId !== 'all', state.filters.status !== 'all', state.filters.language !== 'all'].filter(Boolean).length;

  const results = useMemo(() => {
    const query = state.searchQuery.trim().toLocaleLowerCase(state.locale === 'ko' ? 'ko-KR' : 'en-US');
    return state.items.filter((item) => {
      if (item.status === 'archived') return false;
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
      ].filter(Boolean).join(' ').toLocaleLowerCase(state.locale === 'ko' ? 'ko-KR' : 'en-US');
      return haystack.includes(query);
    });
  }, [state.filters, state.items, state.locale, state.searchQuery]);

  function clearAll() {
    actions.setSearchQuery('');
    actions.setFilters({ ownerId: 'all', status: 'all', language: 'all' });
    setDraftFilters({ ownerId: 'all', status: 'all', language: 'all' });
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
      <section className="mb-6 sm:mb-8">
        <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">{t.title}</h1>
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
                  onClick={() => setDraftFilters({ ownerId: 'all', status: 'all', language: 'all' })}
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
          <p className="text-sm font-medium" aria-live="polite">{t.results(results.length)}</p>
          {activeFilterCount || state.searchQuery ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearAll} data-testid="clear-all-filters">
              {t.reset}
            </Button>
          ) : null}
        </div>
      </section>

      {results.length ? (
        <section
          className="mt-4 grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5"
          aria-label={state.locale === 'ko' ? '검색 결과' : 'Search results'}
          data-testid="catalog-results"
        >
          {results.map((item) => {
            const owner = state.members.find((member) => member.id === item.ownerId);
            const isMine = item.ownerId === state.currentUserId;
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
