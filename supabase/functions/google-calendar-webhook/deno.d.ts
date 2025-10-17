// Type declarations for Deno runtime (Supabase Edge Functions)
declare namespace Deno {
  export const env: {
    get(key: string): string | undefined
  }
}
