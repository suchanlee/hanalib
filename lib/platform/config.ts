export interface ServerConfig {
  deploymentRegion: 'us-west';
  googleClientId?: string;
  googleClientSecret?: string;
  appleClientId?: string;
  appleTeamId?: string;
  appleKeyId?: string;
  applePrivateKey?: string;
  publicAppUrl?: string;
  metadata: {
    nlkApiKey?: string;
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
    googleClientId: source.GOOGLE_CLIENT_ID,
    googleClientSecret: source.GOOGLE_CLIENT_SECRET,
    appleClientId: source.APPLE_CLIENT_ID,
    appleTeamId: source.APPLE_TEAM_ID,
    appleKeyId: source.APPLE_KEY_ID,
    applePrivateKey: source.APPLE_PRIVATE_KEY,
    publicAppUrl: source.PUBLIC_APP_URL,
    metadata: {
      nlkApiKey: source.NLK_API_KEY,
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
    google: Boolean(config.googleClientId && config.googleClientSecret),
    apple: Boolean(config.appleClientId && config.appleTeamId && config.appleKeyId && config.applePrivateKey),
  };
}
