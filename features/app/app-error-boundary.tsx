'use client';

import { Component, type ReactNode } from 'react';
import { ErrorNotice } from './error-notice';
import { userIssue, type UserIssue } from './user-issue';

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { issue?: UserIssue }
> {
  state: { issue?: UserIssue } = {};

  static getDerivedStateFromError(error: Error & { digest?: string }) {
    return {
      issue: { ...userIssue(error, 'render-app'), code: 'render-error' },
    };
  }

  render() {
    if (this.state.issue)
      return (
        <main className="mx-auto max-w-lg space-y-4 p-6">
          <h1 className="text-xl font-semibold">
            화면을 불러오지 못했어요 · Unable to display this page
          </h1>
          <p>페이지를 새로고침해 주세요. / Reload the page to try again.</p>
          <ErrorNotice issue={this.state.issue} locale="ko" />
          <button
            type="button"
            className="rounded border px-4 py-2"
            onClick={() => window.location.reload()}
          >
            새로고침 / Reload page
          </button>
        </main>
      );
    return this.props.children;
  }
}
