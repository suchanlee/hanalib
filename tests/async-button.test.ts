import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { sourceLoader } from './helpers/load-source.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
}
const load = sourceLoader();
const { Button } = load<typeof import('../components/ui/button.tsx')>('components/ui/button.tsx');
const { AlertDialogAction } = load<typeof import('../components/ui/alert-dialog.tsx')>('components/ui/alert-dialog.tsx');

void test('async buttons immediately indicate progress, block repeat taps, and recover after success or handled failure', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let calls = 0;
  let completed = false;
  let error = false;
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const onClick = async () => {
    calls++;
    try {
      await new Promise<void>((done, fail) => { resolve = done; reject = fail; });
      completed = true;
    } catch { error = true; }
  };
  try {
    // Confirmation buttons use the same behavior, including inside portals.
    await act(async () => root.render(React.createElement('div', null,
      React.createElement(AlertDialogAction, { onClick }, 'Confirm return'),
      React.createElement(Button, null, 'Other action'),
    )));
    const [button, other] = container.querySelectorAll('button');
    await act(async () => { button.click(); button.click(); });
    assert.equal(calls, 1);
    assert.equal(completed, false, 'success must wait for the server');
    assert.equal(button.getAttribute('aria-busy'), 'true');
    assert.equal(button.disabled, true);
    assert.ok(button.querySelector('[data-slot="button-spinner"]'));
    assert.equal(button.textContent, 'Confirm return');
    assert.notEqual(other.getAttribute('aria-busy'), 'true');
    await act(async () => reject(new Error('Server unavailable')));
    assert.equal(error, true);
    assert.equal(button.disabled, false);
    assert.equal(button.querySelector('[data-slot="button-spinner"]'), null);
    await act(async () => button.click());
    assert.equal(calls, 2, 'a failed action can be retried');
    await act(async () => resolve());
    assert.equal(completed, true);
    assert.notEqual(button.getAttribute('aria-busy'), 'true');
    assert.equal(button.disabled, false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

void test('form buttons support controlled loading and synchronous actions remain immediate', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let clicks = 0;
  try {
    await act(async () => root.render(React.createElement(Button, { loading: true, type: 'submit' }, 'Saving…')));
    const button = container.querySelector('button')!;
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-busy'), 'true');
    await act(async () => root.render(React.createElement(Button, { onClick: () => { clicks++; } }, 'Open catalog')));
    await act(async () => button.click());
    assert.equal(clicks, 1);
    assert.equal(button.disabled, false);
    assert.equal(button.querySelector('[data-slot="button-spinner"]'), null);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
