import type { ProviderIdentity } from './member';

export function demoIdentity(persona: unknown): ProviderIdentity {
  if (persona === 'borrower') {
    return {
      provider: 'demo',
      providerSubject: 'local-preview-borrower',
      email: 'borrower@localhost.invalid',
      displayName: 'Borrower Preview',
    };
  }
  return {
    provider: 'demo',
    providerSubject: 'local-preview-member',
    email: 'owner@localhost.invalid',
    displayName: 'Owner Preview',
  };
}
