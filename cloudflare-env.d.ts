declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BIZINFO_API_KEY?: string;
    BIZINFO_KEY_ENCRYPTION_SECRET?: string;
  }
}
