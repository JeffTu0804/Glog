/**
 * Ambient types so editors without the Deno extension
 * still type-check supabase/functions/*.ts.
 * Runtime resolution uses deno.json import map + Edge Runtime.
 */

declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
  }
  function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
}

declare module "@supabase/supabase-js" {
  export type SupabaseClient = {
    from: (table: string) => any;
  };
  export function createClient(
    url: string,
    key: string,
    options?: Record<string, unknown>,
  ): SupabaseClient;
}
