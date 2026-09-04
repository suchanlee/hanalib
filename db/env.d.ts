declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    CONTACT_ENCRYPTION_KEY?: string;
    CONTACT_HASH_KEY?: string;
  }
}
