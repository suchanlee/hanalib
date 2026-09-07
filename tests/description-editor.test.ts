import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { sourceLoader } from './helpers/load-source.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
});
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  });
}
void test('description lookup previews before applying and discards results after a concurrent edit', async () => {
  let finish!: (value: { description: string }) => void;
  const load = sourceLoader({
    '@/lib/isbn/providers': {
      ResolvedBookProvider: class {
        lookup(_isbn: string, _locale: string, _signal: unknown, mode: string) {
          assert.equal(mode, 'enrich');
          return new Promise((resolve) => {
            finish = resolve;
          });
        }
      },
    },
  });
  const { DescriptionEditor } = load<
    typeof import('../features/catalog/description-editor.tsx')
  >('features/catalog/description-editor.tsx');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let value = 'Original…';
  const full = 'Original description with its ending.';
  const render = () =>
    root.render(
      React.createElement(DescriptionEditor, {
        id: 'test-description',
        isbn13: '9788932817842',
        locale: 'en',
        bookLanguage: 'en',
        value,
        onChange: (next) => {
          value = next;
          render();
        },
      }),
    );
  try {
    await act(async () => render());
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="find-description"]')!
        .click(),
    );
    await act(async () => finish({ description: full }));
    assert.equal(value, 'Original…');
    assert.ok(
      container.querySelector('[data-testid="description-suggestion"]'),
    );
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'Use this description')!
        .click(),
    );
    assert.equal(value, full);
    value = 'Original…';
    await act(async () => render());
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="find-description"]')!
        .click(),
    );
    value = 'An owner correction.';
    await act(async () => render());
    await act(async () => finish({ description: full }));
    assert.equal(
      container.querySelector('[data-testid="description-suggestion"]'),
      null,
    );
    assert.equal(value, 'An owner correction.');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
