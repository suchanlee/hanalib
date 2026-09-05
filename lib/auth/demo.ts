import type { ProviderIdentity } from './member';

export function demoIdentity(persona: unknown): ProviderIdentity {
  if (persona === 'holder-2') {
    return {
      provider: 'demo',
      providerSubject: 'local-preview-holder-2',
      email: 'holder-2@localhost.invalid',
      displayName: 'Second Holder Preview',
    };
  }
  if (persona === 'holder') {
    return {
      provider: 'demo',
      providerSubject: 'local-preview-holder',
      email: 'holder@localhost.invalid',
      displayName: 'Holder Preview',
    };
  }
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
