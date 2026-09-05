export interface ServerConfig {
  deploymentRegion: 'us-west';
  kakaoRestApiKey?: string;
  kakaoClientSecret?: string;
  publicAppUrl?: string;
  metadata: {
    nlkApiKey?: string;
    naverClientId?: string;
    naverClientSecret?: string;
    googleBooksApiKey?: string;
  };
  messaging: {
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    twilioFromNumber?: string;
    resendApiKey?: string;
    emailFrom?: string;
  };
}

type EnvSource = Record<string, string | undefined>;

export function readServerConfig(source: EnvSource = process.env): ServerConfig {
  const region = source.DEPLOYMENT_REGION ?? 'us-west';
  if (region !== 'us-west') throw new Error('Hana Library currently supports DEPLOYMENT_REGION=us-west only.');

  return {
    deploymentRegion: region,
    kakaoRestApiKey: source.KAKAO_REST_API_KEY,
    kakaoClientSecret: source.KAKAO_CLIENT_SECRET,
    publicAppUrl: source.PUBLIC_APP_URL,
    metadata: {
      nlkApiKey: source.NLK_API_KEY,
      naverClientId: source.NAVER_CLIENT_ID,
      naverClientSecret: source.NAVER_CLIENT_SECRET,
      googleBooksApiKey: source.GOOGLE_BOOKS_API_KEY,
    },
    messaging: {
      twilioAccountSid: source.TWILIO_ACCOUNT_SID,
      twilioAuthToken: source.TWILIO_AUTH_TOKEN,
      twilioFromNumber: source.TWILIO_FROM_NUMBER,
      resendApiKey: source.RESEND_API_KEY,
      emailFrom: source.EMAIL_FROM,
    },
  };
}

export function configuredAuthProviders(config: ServerConfig) {
  return {
    kakao: Boolean(config.kakaoRestApiKey && config.kakaoClientSecret),
  };
}
