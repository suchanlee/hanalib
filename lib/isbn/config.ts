import type { LookupProviderConfig } from './server-lookup.ts';

export function lookupProviderConfig(): LookupProviderConfig {
  return {
    aladinTtbKey: process.env.ALADIN_TTB_KEY,
    nlkApiKey: process.env.NLK_API_KEY,
    naverClientId: process.env.NAVER_CLIENT_ID,
    naverClientSecret: process.env.NAVER_CLIENT_SECRET,
    kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,
    googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY,
    timeoutMs: 8_000,
  };
}
