import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { sourceLoader } from './helpers/load-source.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://library.example',
  pretendToBeVisual: true,
});
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
}

const member = {
  id: 'member-1', displayName: 'Member', displayNameKo: '회원', initials: 'M', locale: 'en',
  notificationChannel: 'email', phone: '', phoneVerified: false, email: '',
};
const state = {
  locale: 'en', currentUserId: member.id, members: [member], isMutating: false,
};
const actions = { requestEmailVerification: async () => {} };

function element(tag: string) {
  return ({ children, loading: _loading, showCloseButton: _showCloseButton, ...props }: Record<string, unknown> & { children?: ReactNode }) =>
    React.createElement(tag, props, children);
}

const load = sourceLoader({
  '@/features/app/app-context': { useHanaApp: () => ({ state, actions }) },
  '@/components/ui/button': { Button: element('button') },
  '@/components/ui/input': { Input: element('input') },
  '@/components/ui/label': { Label: element('label') },
  '@/components/ui/dialog': {
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? React.createElement(React.Fragment, null, children) : null,
    DialogContent: element('div'),
    DialogDescription: element('p'),
    DialogFooter: element('div'),
    DialogHeader: element('div'),
    DialogTitle: element('h2'),
  },
  'lucide-react': { MailCheck: () => null },
});
const { EmailCompletionDialog } = load<{ EmailCompletionDialog(this: void): ReactNode }>('features/settings/email-completion-dialog.tsx');

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(EmailCompletionDialog)));
  return {
    container,
    async close() { await act(async () => root.unmount()); container.remove(); },
  };
}

void test('prompts a member without email again on a fresh app mount', async () => {
  const first = await mount();
  assert.ok(first.container.querySelector('[data-testid="email-completion-dialog"]'));
  const notNow = [...first.container.querySelectorAll('button')].find((button) => button.textContent === 'Not now');
  await act(async () => notNow?.click());
  assert.equal(first.container.querySelector('[data-testid="email-completion-dialog"]'), null);
  await act(async () => window.dispatchEvent(new dom.window.Event('pageshow')));
  assert.ok(first.container.querySelector('[data-testid="email-completion-dialog"]'));
  await first.close();

  const nextVisit = await mount();
  assert.ok(nextVisit.container.querySelector('[data-testid="email-completion-dialog"]'));
  await nextVisit.close();
});

void test('does not prompt a member whose verified email is already loaded', async () => {
  member.email = 'member@example.com';
  const view = await mount();
  assert.equal(view.container.querySelector('[data-testid="email-completion-dialog"]'), null);
  await view.close();
  member.email = '';
});
