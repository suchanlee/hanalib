import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { sourceLoader } from './helpers/load-source.ts';
import type { HanaAppActions, HanaAppState } from '../lib/domain/types.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://library.example',
  pretendToBeVisual: true,
});
for (const [key, value] of Object.entries({
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  });
}
const profile = {
  id: 'member',
  displayName: 'Member',
  displayNameKo: '회원',
  initials: 'M',
  locale: 'en',
  notificationChannel: 'email',
  phone: '',
  phoneVerified: false,
  email: 'member@example.com',
};
const bootstrap = {
  profile,
  members: [profile],
  items: [],
  requests: [],
  loans: [],
  holds: [],
  holdCounts: {},
  returnChecks: [],
};
const load = sourceLoader({ 'next/image': () => null });
const { ApiError } =
  load<typeof import('../lib/http/client.ts')>('lib/http/client.ts');
const app = load<{
  HanaAppProvider: (props: { children: ReactNode }) => ReactNode;
  useHanaApp: () => { state: HanaAppState; actions: HanaAppActions };
}>('features/app/app-context.tsx');
const { ErrorNotice } = load<{
  ErrorNotice: (props: {
    issue: NonNullable<HanaAppState['issue']>;
    locale: 'en';
    onRetry?: () => Promise<void>;
  }) => ReactNode;
}>('features/app/error-notice.tsx');
let current: ReturnType<typeof app.useHanaApp>;
function Probe() {
  current = app.useHanaApp();
  return current.state.issue
    ? React.createElement(ErrorNotice, {
        issue: current.state.issue,
        locale: 'en',
        onRetry: () => current.actions.refresh(),
      })
    : null;
}
async function mount() {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const root = createRoot(element);
  await act(async () =>
    root.render(
      React.createElement(
        app.HanaAppProvider,
        null,
        React.createElement(Probe),
      ),
    ),
  );
  return {
    element,
    close: async () => {
      await act(async () => root.unmount());
      element.remove();
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

void test('remote declines refresh when returning, navigating, or receiving a push', async (t) => {
  const serviceWorker = new dom.window.EventTarget();
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  });
  const request = {
    id: 'request',
    catalogItemId: 'item',
    requesterId: profile.id,
    status: 'pending',
    requestedAt: '2026-09-05T00:00:00Z',
    expiresAt: '2026-09-07T00:00:00Z',
  };
  const triggers = [
    () => window.dispatchEvent(new dom.window.Event('focus')),
    () => document.dispatchEvent(new dom.window.Event('visibilitychange')),
    () => window.dispatchEvent(new dom.window.Event('online')),
    () => window.dispatchEvent(new dom.window.Event('pageshow')),
    () => current.actions.setScreen('borrowing'),
    () =>
      serviceWorker.dispatchEvent(
        new dom.window.MessageEvent('message', {
          data: { type: 'library-updated' },
        }),
      ),
  ];
  try {
    for (const trigger of triggers) {
      window.history.replaceState({}, '', '/');
      let status = 'pending';
      const fetch = t.mock.method(globalThis, 'fetch', async () =>
        Response.json({
          data: { ...bootstrap, requests: [{ ...request, status }] },
        }),
      );
      const view = await mount();
      try {
        assert.equal(current.state.requests[0].status, 'pending');
        status = 'declined';
        await act(async () => {
          trigger();
        });
        assert.equal(
          current.state.requests.filter((entry) => entry.status === 'pending')
            .length,
          0,
        );
        assert.equal(current.state.requests[0].status, 'declined');
      } finally {
        await view.close();
        fetch.mock.restore();
      }
    }
  } finally {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    window.history.replaceState({}, '', '/');
  }
});

void test('bootstrap failure stays visible and retry recovers; initial 401 is a normal sign-in state', async (t) => {
  let response = () =>
    Response.json(
      { error: { code: 'internal-error' } },
      { status: 500, headers: { 'x-request-id': 'bootstrap-123' } },
    );
  t.mock.method(globalThis, 'fetch', async () => response());
  const view = await mount();
  try {
    assert.equal(current.state.loadStatus, 'error');
    assert.match(view.element.textContent!, /couldn’t load the library/);
    assert.match(view.element.textContent!, /bootstrap-123/);
    assert.ok(view.element.querySelector('[role="alert"]'));
    response = () => Response.json({ data: bootstrap });
    await act(() => current.actions.refresh());
    assert.equal(current.state.loadStatus, 'ready');
    assert.equal(current.state.isAuthenticated, true);
    assert.equal(view.element.querySelector('[role="alert"]'), null);
  } finally {
    await view.close();
  }
  response = () => Response.json({ error: 'unauthenticated' }, { status: 401 });
  const signedOut = await mount();
  assert.equal(current.state.loadStatus, 'ready');
  assert.equal(current.state.isAuthenticated, false);
  assert.equal(current.state.issue, undefined);
  await signedOut.close();
});

void test('background polling skips hidden/offline apps, coalesces reads, recovers quietly, and cleans up', async (t) => {
  let poll!: () => void;
  t.mock.method(
    window,
    'setInterval',
    (callback: () => void, delay: number) => {
      assert.equal(delay, 30_000);
      poll = callback;
      return 123;
    },
  );
  const clear = t.mock.method(window, 'clearInterval', () => {});
  let next = async () => Response.json({ data: bootstrap });
  const fetch = t.mock.method(globalThis, 'fetch', async () => next());
  const view = await mount();
  try {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    await act(async () => poll());
    assert.equal(fetch.mock.callCount(), 1);
    Reflect.deleteProperty(document, 'visibilityState');
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    await act(async () => poll());
    assert.equal(fetch.mock.callCount(), 1);
    Reflect.deleteProperty(navigator, 'onLine');

    const response = deferred<Response>();
    next = () => response.promise;
    await act(async () => {
      poll();
      window.dispatchEvent(new dom.window.Event('focus'));
      document.dispatchEvent(new dom.window.Event('visibilitychange'));
    });
    assert.equal(fetch.mock.callCount(), 2);
    await act(async () =>
      response.resolve(
        Response.json({ error: 'unavailable' }, { status: 503 }),
      ),
    );
    assert.equal(current.state.loadStatus, 'ready');
    assert.equal(current.state.issue, undefined);
    assert.equal(current.state.isAuthenticated, true);

    next = async () =>
      Response.json({
        data: {
          ...bootstrap,
          members: [{ ...profile, displayName: 'Remote change' }],
        },
      });
    await act(async () => poll());
    assert.equal(current.state.members[0].displayName, 'Remote change');

    next = async () =>
      Response.json({ error: 'unauthenticated' }, { status: 401 });
    await act(async () => poll());
    assert.equal(current.state.isAuthenticated, false);
    assert.equal(current.state.members.length, 0);
    const count = fetch.mock.callCount();
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    assert.equal(fetch.mock.callCount(), count);
    assert.equal(clear.mock.callCount(), 1);
  } finally {
    Reflect.deleteProperty(document, 'visibilityState');
    Reflect.deleteProperty(navigator, 'onLine');
    await view.close();
  }
});

void test('an older background read cannot undo a cancellation or run during a mutation', async (t) => {
  const request = {
    id: 'request',
    catalogItemId: 'item',
    requesterId: profile.id,
    status: 'pending',
    requestedAt: '2026-09-05T00:00:00Z',
    expiresAt: '2026-09-07T00:00:00Z',
  };
  const data = { ...bootstrap, requests: [request] };
  const stale = deferred<Response>();
  const mutation = deferred<Response>();
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url !== '/api/app') return mutation.promise;
    return ++reads === 1 ? Response.json({ data }) : stale.promise;
  });
  const view = await mount();
  try {
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    let cancel!: Promise<void>;
    await act(async () => {
      cancel = current.actions.cancelRequest('request');
    });
    await act(async () => stale.resolve(Response.json({ data })));
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    assert.equal(reads, 2);
    await act(async () => {
      mutation.resolve(
        Response.json({ data: { ...request, status: 'canceled' } }),
      );
      await cancel;
    });
    assert.equal(current.state.requests[0].status, 'canceled');

    // A read started before a later mutation must also be ignored if it finishes last.
    const late = deferred<Response>();
    t.mock.method(globalThis, 'fetch', async (url: string) =>
      url === '/api/app'
        ? late.promise
        : Response.json({ data: { ...request, status: 'canceled' } }),
    );
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    await act(() => current.actions.cancelRequest('request'));
    await act(async () => late.resolve(Response.json({ data })));
    assert.equal(current.state.requests[0].status, 'canceled');
  } finally {
    await view.close();
  }
});

void test('return and cancellation promises never announce success while pending or after rejection', async (t) => {
  let pending = deferred<Response>();
  t.mock.method(globalThis, 'fetch', async (url: string) =>
    url === '/api/app' ? Response.json({ data: bootstrap }) : pending.promise,
  );
  const view = await mount();
  try {
    for (const operation of [
      () => current.actions.markReturned('loan'),
      () => current.actions.cancelRequest('request'),
    ]) {
      pending = deferred<Response>();
      let rejected: Promise<unknown>;
      await act(async () => {
        rejected = assert.rejects(operation());
      });
      assert.equal(current.state.isMutating, true);
      assert.equal(current.state.announcement, undefined);
      await act(async () => {
        pending.resolve(
          Response.json(
            { error: { code: 'conflict' } },
            { status: 409, headers: { 'x-request-id': 'mutation-123' } },
          ),
        );
        await rejected;
      });
      assert.equal(current.state.announcement, undefined);
      assert.equal(current.state.isMutating, false);
      assert.match(view.element.textContent!, /Refresh the list/);
      assert.match(view.element.textContent!, /mutation-123/);
    }
  } finally {
    await view.close();
  }
});

void test('a saved action with failed refresh reports saved-but-stale and recovers without repeating the mutation', async (t) => {
  let getFails = false;
  let mutations = 0;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === '/api/app')
      return getFails
        ? Response.json(
            { error: 'unavailable' },
            { status: 503, headers: { 'x-request-id': 'sync-123' } },
          )
        : Response.json({ data: bootstrap });
    mutations++;
    getFails = true;
    return Response.json({ data: { id: 'loan', status: 'returned' } });
  });
  const view = await mount();
  try {
    await act(async () => {
      await assert.rejects(current.actions.markReturned('loan'));
    });
    assert.equal(current.state.issue?.code, 'sync-failed');
    assert.equal(current.state.announcement, undefined);
    assert.match(view.element.textContent!, /change was saved/);
    getFails = false;
    const refresh = [...view.element.querySelectorAll('button')].find(
      (button) => button.textContent === 'Refresh library',
    )!;
    await act(async () => refresh.click());
    assert.equal(mutations, 1);
    assert.equal(current.state.issue, undefined);
  } finally {
    await view.close();
  }
});

void test('logout preserves state on HTTP/network failures, clears it only after confirmed success, and ignores old refreshes', async (t) => {
  let logout: () => Promise<Response> = async () =>
    Response.json(
      { error: 'unavailable' },
      { status: 503, headers: { 'x-request-id': 'logout-123' } },
    );
  let loadApp: () => Promise<Response> = async () =>
    Response.json({ data: bootstrap });
  t.mock.method(globalThis, 'fetch', async (url: string) =>
    url === '/api/app' ? loadApp() : logout(),
  );
  const view = await mount();
  try {
    for (const failure of [
      logout,
      async () => {
        throw new TypeError('Offline');
      },
    ]) {
      logout = failure;
      await act(async () => {
        await assert.rejects(current.actions.signOut());
      });
      assert.equal(current.state.isAuthenticated, true);
      assert.match(view.element.textContent!, /may still be signed in/);
    }
    const delayed = deferred<Response>();
    loadApp = () => delayed.promise;
    let refreshing!: Promise<void>;
    await act(async () => {
      refreshing = current.actions.refresh();
    });
    logout = async () => Response.json({ ok: true });
    await act(() => current.actions.signOut());
    assert.equal(current.state.isAuthenticated, false);
    await act(async () => {
      delayed.resolve(Response.json({ data: bootstrap }));
      await refreshing;
    });
    assert.equal(current.state.isAuthenticated, false);
    assert.equal(current.state.members.length, 0);
  } finally {
    await view.close();
  }
});

void test('a 401 mutation displays session recovery and clears private state', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string) =>
    url === '/api/app'
      ? Response.json({ data: bootstrap })
      : Response.json({ error: { code: 'unauthenticated' } }, { status: 401 }),
  );
  const view = await mount();
  try {
    await act(async () => {
      await assert.rejects(current.actions.cancelRequest('request'));
    });
    assert.equal(current.state.isAuthenticated, false);
    assert.equal(current.state.members.length, 0);
    assert.match(view.element.textContent!, /session has expired/);
  } finally {
    await view.close();
  }
});

void test('copy failure exposes selectable diagnostic details and screenshot guidance', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ data: bootstrap }),
  );
  const view = await mount();
  try {
    await act(async () =>
      current.actions.reportError(
        new ApiError(500, 'internal-error', 'copy-123'),
      ),
    );
    const button = [...view.element.querySelectorAll('button')].find(
      (item) => item.textContent === 'Copy error details',
    )!;
    await act(async () => button.click());
    assert.match(view.element.textContent!, /take a screenshot/);
    assert.equal(view.element.querySelector('details')?.open, true);
  } finally {
    await view.close();
  }
});

async function mountContent(content: ReactNode) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const root = createRoot(element);
  await act(async () => root.render(content));
  return {
    element,
    close: async () => {
      await act(async () => root.unmount());
      element.remove();
    },
  };
}

void test('OAuth callback failures are shown with their reference, and provider loading can recover', async (t) => {
  const { AuthView } = load<{ AuthView: () => ReactNode }>(
    'features/auth/auth-view.tsx',
  );
  window.history.replaceState(
    null,
    '',
    '/?authError=invalid_state&authRequestId=oauth-123',
  );
  let providersFail = false;
  t.mock.method(globalThis, 'fetch', async (url: string) =>
    url === '/api/app'
      ? Response.json({ error: 'unauthenticated' }, { status: 401 })
      : providersFail
        ? Response.json(
            { error: 'unavailable' },
            { status: 503, headers: { 'x-request-id': 'providers-123' } },
          )
        : Response.json({ kakao: true, demo: false }),
  );
  const view = await mountContent(
    React.createElement(
      app.HanaAppProvider,
      null,
      React.createElement(AuthView),
      React.createElement(Probe),
    ),
  );
  try {
    assert.match(view.element.textContent!, /sign-in link expired/);
    assert.match(view.element.textContent!, /oauth-123/);
    assert.equal(window.location.search, '');
  } finally {
    await view.close();
  }
  providersFail = true;
  const retry = await mountContent(
    React.createElement(
      app.HanaAppProvider,
      null,
      React.createElement(AuthView),
      React.createElement(Probe),
    ),
  );
  try {
    assert.doesNotMatch(
      retry.element.textContent!,
      /Sign-in setup is still in progress/,
    );
    assert.match(retry.element.textContent!, /providers-123/);
    providersFail = false;
    const button = [...retry.element.querySelectorAll('button')].find((item) =>
      /Reload sign-in options|로그인 옵션 다시/.test(item.textContent!),
    )!;
    await act(async () => button.click());
    assert.equal(
      (
        retry.element.querySelector(
          '[data-testid="auth-kakao"]',
        ) as HTMLButtonElement
      ).disabled,
      false,
    );
    assert.equal(current.state.issue, undefined);
  } finally {
    await retry.close();
  }
});

void test('book details do not display a canceled-success message after the cancellation fails', async (t) => {
  const { BookDetailView } = load<{ BookDetailView: () => ReactNode }>(
    'features/catalog/book-detail-view.tsx',
  );
  const { initialAppState } = load<{ initialAppState: HanaAppState }>(
    'lib/domain/seed.ts',
  );
  const data = {
    ...initialAppState,
    profile: { ...initialAppState.members[0], locale: 'en' },
  };
  window.history.replaceState(null, '', '/?book=item-ed-almond');
  const pending = deferred<Response>();
  t.mock.method(globalThis, 'fetch', async (url: string) =>
    url === '/api/app' ? Response.json({ data }) : pending.promise,
  );
  const view = await mountContent(
    React.createElement(
      app.HanaAppProvider,
      null,
      React.createElement(BookDetailView),
      React.createElement(Probe),
    ),
  );
  try {
    await act(async () => current.actions.selectItem('item-ed-almond'));
    const cancel = view.element.querySelector(
      '[data-testid="cancel-borrow-request"]',
    ) as HTMLButtonElement;
    assert.ok(cancel);
    await act(async () => cancel.click());
    assert.equal(
      view.element.querySelector('[data-testid="detail-feedback"]'),
      null,
    );
    await act(async () =>
      pending.resolve(Response.json({ error: 'conflict' }, { status: 409 })),
    );
    assert.equal(
      view.element.querySelector('[data-testid="detail-feedback"]'),
      null,
    );
    assert.ok(view.element.querySelector('[data-testid="app-error"]'));
  } finally {
    await view.close();
    window.history.replaceState(null, '', '/');
  }
});

void test('a render exception has a visible recovery screen and shareable details', async (t) => {
  const { AppErrorBoundary } = load<{
    AppErrorBoundary: React.ComponentType<{ children: ReactNode }>;
  }>('features/app/app-error-boundary.tsx');
  t.mock.method(console, 'error', () => {});
  function Broken(): ReactNode {
    throw new Error('private render content');
  }
  const view = await mountContent(
    React.createElement(AppErrorBoundary, null, React.createElement(Broken)),
  );
  try {
    assert.match(view.element.textContent!, /Reload page/);
    assert.match(view.element.textContent!, /render-error/);
    assert.doesNotMatch(view.element.textContent!, /private render content/);
  } finally {
    await view.close();
  }
});

void test('unexpected event and promise errors surface safe recovery details', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ data: bootstrap }),
  );
  const view = await mount();
  try {
    const rejection = new dom.window.Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', {
      value: new Error('private exception text'),
    });
    await act(async () => {
      window.dispatchEvent(rejection);
    });
    assert.equal(current.state.issue?.operation, 'unexpected-action');
    assert.match(view.element.textContent!, /organizer/);
    assert.doesNotMatch(view.element.textContent!, /private exception text/);
    await act(async () => current.actions.dismissIssue());
    await act(async () => {
      window.dispatchEvent(
        new dom.window.ErrorEvent('error', {
          error: new TypeError('private type error'),
        }),
      );
    });
    assert.equal(current.state.issue?.operation, 'unexpected-action');
  } finally {
    await view.close();
  }
});

void test('every circulation action preserves a saved-but-stale result when synchronization fails', async (t) => {
  const operations = [
    () => current.actions.respondToRequest('request', 'accepted'),
    () => current.actions.respondToRequest('request', 'declined'),
    () => current.actions.markReturned('loan'),
    () => current.actions.joinHold('item'),
    () => current.actions.cancelHold('hold'),
    () => current.actions.claimHold('hold'),
    () => current.actions.respondToReturnCheck('check', false),
    () => current.actions.respondToReturnCheck('check', true),
  ];
  for (const operation of operations) {
    let saved = false;
    let mutationCount = 0;
    t.mock.method(globalThis, 'fetch', async (url: string) => {
      if (url === '/api/app')
        return saved
          ? Response.json({ error: 'unavailable' }, { status: 503 })
          : Response.json({ data: bootstrap });
      saved = true;
      mutationCount++;
      return Response.json({ data: { id: 'saved-result' } });
    });
    const view = await mount();
    try {
      await act(async () => {
        await assert.rejects(operation());
      });
      assert.equal(current.state.issue?.code, 'sync-failed');
      assert.equal(current.state.announcement, undefined);
      assert.equal(mutationCount, 1);
    } finally {
      await view.close();
      t.mock.restoreAll();
    }
  }
});

void test('confirmed profile updates and cancellations update state and announce success', async (t) => {
  const request = {
    id: 'request',
    catalogItemId: 'item',
    requesterId: 'member',
    status: 'pending',
    requestedAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
  };
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === '/api/app')
      return Response.json({ data: { ...bootstrap, requests: [request] } });
    if (url === '/api/profile')
      return Response.json({
        data: { ...profile, displayName: 'Updated name' },
      });
    return Response.json({ data: { ...request, status: 'canceled' } });
  });
  const view = await mount();
  try {
    await act(async () => {
      await current.actions.updateProfile({ displayName: 'Updated name' });
    });
    assert.equal(current.state.members[0].displayName, 'Updated name');
    assert.equal(current.state.announcement, 'Settings saved.');
    await act(() => current.actions.cancelRequest('request'));
    assert.equal(current.state.requests[0].status, 'canceled');
    assert.equal(current.state.announcement, 'Request canceled.');
    assert.equal(current.state.issue, undefined);
  } finally {
    await view.close();
  }
});

void test('retrying failed notification disable rechecks status without turning notifications back on', async (t) => {
  let subscribed = true;
  let subscribeCalls = 0;
  const pushLoad = sourceLoader({
    '@/features/app/app-context': app,
    '@/lib/http/client': load('lib/http/client.ts'),
    '@mmmike/web-push/client': {
      getCurrentSubscription: async () =>
        subscribed ? { endpoint: 'https://fcm.googleapis.com/test' } : null,
      getNotificationPermission: () => 'granted',
      isPushSupported: () => true,
      serializeSubscription: () => ({}),
      subscribe: async () => {
        subscribeCalls++;
        return {};
      },
      unsubscribe: async () => {
        subscribed = false;
        return 'https://fcm.googleapis.com/test';
      },
    },
  });
  const { PushNotificationCard } = pushLoad<{
    PushNotificationCard: (props: { locale: 'en' }) => ReactNode;
  }>('features/settings/push-notification-card.tsx');
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) =>
    url === '/api/app'
      ? Response.json({ data: bootstrap })
      : init?.method === 'DELETE'
        ? Response.json({ error: 'unavailable' }, { status: 503 })
        : Response.json({ data: {} }),
  );
  const view = await mountContent(
    React.createElement(
      app.HanaAppProvider,
      null,
      React.createElement(PushNotificationCard, { locale: 'en' }),
      React.createElement(Probe),
    ),
  );
  try {
    await act(async () =>
      (
        view.element.querySelector(
          '[data-testid="push-disable"]',
        ) as HTMLButtonElement
      ).click(),
    );
    assert.ok(
      view.element.querySelector('[data-testid="push-notification-error"]'),
    );
    const retry = [...view.element.querySelectorAll('button')].find(
      (button) => button.textContent === 'Try again',
    )!;
    await act(async () => retry.click());
    assert.equal(subscribeCalls, 0);
    assert.ok(view.element.querySelector('[data-testid="push-enable"]'));
  } finally {
    await view.close();
  }
});

void test('a reloaded provider shares context with already mounted consumers', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ data: bootstrap }),
  );
  const reloaded = sourceLoader({
    './hana-context': load('features/app/hana-context.ts'),
  });
  const { HanaAppProvider: ReloadedProvider } = reloaded<{
    HanaAppProvider: (props: { children: ReactNode }) => ReactNode;
  }>('features/app/app-context.tsx');
  const view = await mountContent(
    React.createElement(ReloadedProvider, null, React.createElement(Probe)),
  );
  try {
    assert.equal(current.state.isAuthenticated, true);
    assert.equal(current.state.currentUserId, 'member');
  } finally {
    await view.close();
  }
});
