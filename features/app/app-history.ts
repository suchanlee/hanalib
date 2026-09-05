import type { AppScreen } from '@/lib/domain/types';

export interface AppRoute {
  screen: AppScreen;
  selectedItemId?: string;
}

export const APP_HISTORY_STATE_KEY = 'hanaLibraryNavigation';

export function appHref(screen: AppScreen, selectedItemId?: string) {
  if (screen === 'detail' && selectedItemId) return `/?book=${encodeURIComponent(selectedItemId)}`;
  if (screen === 'intake') return '/?view=scan';
  if (screen === 'borrowing') return '/?view=borrowing';
  if (screen === 'settings') return '/?view=settings';
  return '/';
}

export function appRouteFromLocation(pathname: string, search = ''): AppRoute | undefined {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname;

  if (normalizedPath === '/settings') return { screen: 'settings' };
  if (normalizedPath === '/borrowing') return { screen: 'borrowing' };
  if (normalizedPath === '/scan') return { screen: 'intake' };

  const bookPath = normalizedPath.match(/^\/books\/([^/]+)$/u);
  if (bookPath) {
    try {
      return { screen: 'detail', selectedItemId: decodeURIComponent(bookPath[1]) };
    } catch {
      return undefined;
    }
  }

  if (normalizedPath !== '/') return undefined;

  const parameters = new URLSearchParams(search);
  const selectedItemId = parameters.get('book');
  if (selectedItemId) return { screen: 'detail', selectedItemId };

  const view = parameters.get('view');
  if (view === 'scan') return { screen: 'intake' };
  if (view === 'borrowing') return { screen: 'borrowing' };
  if (view === 'settings') return { screen: 'settings' };
  return { screen: 'catalog' };
}

export function sameAppRoute(left: AppRoute | undefined, right: AppRoute) {
  return left?.screen === right.screen && left.selectedItemId === right.selectedItemId;
}
