import type { Member } from '@/lib/domain/types';
import { jsonObject, withLibraryApi } from '@/lib/persistence/server';
import { libraryError } from '@/lib/persistence/errors';

export async function PATCH(request: Request) {
  return withLibraryApi(request, async (repository, context) => {
    const body = await jsonObject(request);
    if (body.displayName !== undefined && typeof body.displayName !== 'string') throw libraryError('invalid-input', 'displayName must be a string.');
    if (body.displayNameKo !== undefined && typeof body.displayNameKo !== 'string') throw libraryError('invalid-input', 'displayNameKo must be a string.');
    if (body.locale !== undefined && body.locale !== 'ko' && body.locale !== 'en') throw libraryError('invalid-input', 'locale must be ko or en.');
    if (body.notificationChannel !== undefined && body.notificationChannel !== 'email' && body.notificationChannel !== 'sms' && body.notificationChannel !== 'both') {
      throw libraryError('invalid-input', 'notificationChannel must be email, sms, or both.');
    }
    if (body.phone !== undefined && typeof body.phone !== 'string') throw libraryError('invalid-input', 'phone must be a string.');
    const changes: Partial<Member> = {
      displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      displayNameKo: typeof body.displayNameKo === 'string' ? body.displayNameKo : undefined,
      locale: body.locale === 'ko' || body.locale === 'en' ? body.locale : undefined,
      notificationChannel: body.notificationChannel === 'email' || body.notificationChannel === 'sms' || body.notificationChannel === 'both'
        ? body.notificationChannel
        : undefined,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
    };
    return repository.updateProfile(context, changes);
  }, { mutation: true });
}
