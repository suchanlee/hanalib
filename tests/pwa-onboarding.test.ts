import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { sourceLoader } from './helpers/load-source.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://library.example',
  pretendToBeVisual: true,
});

Object.defineProperties(dom.window.navigator, {
  maxTouchPoints: { configurable: true, value: 5 },
  platform: { configurable: true, value: 'iPhone' },
  userAgent: {
    configurable: true,
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile',
  },
});

Object.defineProperty(dom.window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    addEventListener() {},
    dispatchEvent: () => false,
    matches: query.includes('pointer: coarse'),
    media: query,
    onchange: null,
    removeEventListener() {},
  }),
});

for (const [key, value] of Object.entries({
  Event: dom.window.Event,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
  document: dom.window.document,
  navigator: dom.window.navigator,
  window: dom.window,
})) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  });
}

function Button({
  children,
  size: _size,
  variant: _variant,
  ...props
}: ComponentProps<'button'> & { size?: string; variant?: string }) {
  return React.createElement('button', props, children);
}

function Container({ children }: { children?: ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

const load = sourceLoader({
  './app-context': {
    useHanaApp: () => ({
      state: { isAuthenticated: true, locale: 'en' },
    }),
  },
  '@/components/ui/button': { Button },
  '@/components/ui/dialog': {
    Dialog: Container,
    DialogContent: Container,
    DialogDescription: Container,
    DialogHeader: Container,
    DialogTitle: Container,
  },
  '@mmmike/web-push/client': {
    getCurrentSubscription: async () => undefined,
    getNotificationPermission: () => 'default',
    isPushSupported: () => true,
    serializeSubscription: () => ({}),
    subscribe: async () => ({ status: 'unsupported' }),
  },
});

const { PwaOnboarding } = load<{
  PwaOnboarding: () => ReactNode;
}>('features/app/pwa-onboarding.tsx');

async function mount() {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const root = createRoot(element);
  await act(async () => root.render(React.createElement(PwaOnboarding)));
  return {
    element,
    close: async () => {
      await act(async () => root.unmount());
      element.remove();
    },
  };
}

void test('dismissal lasts only until the next page load', async () => {
  window.sessionStorage.setItem('hana-pwa-onboarding-dismissed', '1');

  const firstPage = await mount();
  assert.ok(firstPage.element.querySelector('[data-testid="pwa-onboarding"]'));

  const dismiss = firstPage.element.querySelector<HTMLButtonElement>(
    'button[aria-label="Not now"]',
  );
  assert.ok(dismiss);
  await act(async () => dismiss.click());
  assert.equal(
    firstPage.element.querySelector('[data-testid="pwa-onboarding"]'),
    null,
  );
  await firstPage.close();

  const refreshedPage = await mount();
  assert.ok(
    refreshedPage.element.querySelector('[data-testid="pwa-onboarding"]'),
  );
  await refreshedPage.close();
});
