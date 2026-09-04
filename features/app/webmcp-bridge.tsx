'use client';

import { useEffect } from 'react';
import { useHanaApp } from './app-context';

interface ModelTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute(input: unknown): unknown | Promise<unknown>;
}

interface ModelContext {
  registerTool(tool: ModelTool, options?: { signal?: AbortSignal }): void | Promise<void>;
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an object input.');
  return input as Record<string, unknown>;
}

export function WebMcpBridge() {
  const { state, actions } = useHanaApp();

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const register = (tool: ModelTool) => {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch((error: unknown) => console.warn('WebMCP registration failed', error));
      } catch (error) {
        console.warn('WebMCP registration failed', error);
      }
    };

    register({
      name: 'get_library_state',
      title: 'Get library state',
      description: 'Read the signed-in member, current view, catalog counts, and active circulation counts.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        return { authenticated: state.isAuthenticated, memberId: state.isAuthenticated ? state.currentUserId : null, screen: state.screen, catalogItems: state.items.filter((item) => item.status !== 'archived').length, pendingRequests: state.requests.filter((request) => request.status === 'pending').length, activeLoans: state.loans.filter((loan) => loan.status === 'active').length };
      },
    });

    register({
      name: 'search_catalog',
      title: 'Search catalog',
      description: 'Open the catalog and search by a Korean or English title, author, or ISBN.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 200 } }, required: ['query'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!state.isAuthenticated) throw new Error('Sign in before searching the member catalog.');
        const query = objectInput(input).query;
        if (typeof query !== 'string') throw new Error('query must be a string.');
        actions.setSearchQuery(query.slice(0, 200));
        actions.setScreen('catalog');
        return { screen: 'catalog', query: query.slice(0, 200) };
      },
    });

    register({
      name: 'start_book_intake',
      title: 'Start adding a book',
      description: 'Open the barcode-first flow to scan or enter a book ISBN. This only starts the flow and does not create an item.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        if (!state.isAuthenticated) throw new Error('Sign in before adding a book.');
        actions.setScreen('intake');
        return { screen: 'intake', created: false };
      },
    });

    register({
      name: 'request_book_loan',
      title: 'Request a book loan',
      description: 'Submit a 48-hour borrow request for one available catalog copy.',
      inputSchema: { type: 'object', properties: { itemId: { type: 'string' } }, required: ['itemId'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!state.isAuthenticated) throw new Error('Sign in before requesting a loan.');
        const itemId = objectInput(input).itemId;
        if (typeof itemId !== 'string') throw new Error('itemId must be a string.');
        const item = state.items.find((candidate) => candidate.id === itemId);
        if (!item || item.status !== 'available' || item.ownerId === state.currentUserId) throw new Error('This copy cannot be requested by the current member.');
        actions.requestBorrow(itemId);
        return { itemId, status: 'pending', expiresInHours: 48 };
      },
    });

    register({
      name: 'mark_loan_returned',
      title: 'Mark loan returned',
      description: 'Record that an active loan has been returned. Only its borrower or owner may do this.',
      inputSchema: { type: 'object', properties: { loanId: { type: 'string' } }, required: ['loanId'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!state.isAuthenticated) throw new Error('Sign in before recording a return.');
        const loanId = objectInput(input).loanId;
        if (typeof loanId !== 'string') throw new Error('loanId must be a string.');
        const loan = state.loans.find((candidate) => candidate.id === loanId);
        if (!loan || loan.status !== 'active' || (loan.ownerId !== state.currentUserId && loan.borrowerId !== state.currentUserId)) throw new Error('This loan cannot be returned by the current member.');
        actions.markReturned(loanId);
        return { loanId, status: 'returned' };
      },
    });

    return () => lifecycle.abort();
  }, [actions, state]);

  return null;
}
