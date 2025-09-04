import { createBrowserClient } from '@supabase/ssr';

// Use cookies (instead of localStorage) as the storage mechanism for the auth
// session on the browser. While cookies set via JavaScript are *not* HttpOnly,
// persisting the session in cookies allows the server-side Supabase client to
// share the same credentials and enables you to tighten the cookie flags
// (Secure, SameSite, limited Max-Age) globally via the cookieOptions below. If
// you configure your application/server (e.g. via middleware) to set/refresh
// these cookies on the server, they will automatically be promoted to
// HttpOnly cookies – and therefore no longer accessible from the browser –
// without requiring any further changes in this client helper.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Instruct @supabase/ssr to keep the session inside cookies.
      cookies: {
        // Return **all** cookies as required by the `getAll` interface.
        getAll(): { name: string; value: string }[] {
          if (typeof document === 'undefined') return [];
          return document.cookie
            .split(';')
            .filter(Boolean)
            .map((c) => {
              const [name, ...rest] = c.trim().split('=');
              return { name, value: decodeURIComponent(rest.join('=')) };
            });
        },
        // Persist or delete the provided cookies.
        setAll(cookies: { name: string; value: string | null; options?: {
            path?: string;
            maxAge?: number;
            expires?: number | Date;
            sameSite?: 'lax' | 'strict' | 'none';
            secure?: boolean;
          }; }[]): void {
          if (typeof document === 'undefined') return;
          cookies.forEach((cookie: { name: string; value: string | null; options?: { path?: string; maxAge?: number; expires?: number | Date; sameSite?: 'lax' | 'strict' | 'none'; secure?: boolean; }; }) => {
            const { name, value, options } = cookie;
            let cookieStr = `${name}=${encodeURIComponent(value ?? '')}`;

            // Path
            cookieStr += `; Path=${options?.path ?? '/'}`;

            // Max-Age / Expires
            if (options?.maxAge) {
              cookieStr += `; Max-Age=${options.maxAge}`;
            } else if (options?.expires) {
              cookieStr += `; Expires=${new Date(options.expires).toUTCString()}`;
            }

            // SameSite
            if (options?.sameSite) {
              cookieStr += `; SameSite=${options.sameSite}`;
            }

            // Secure flag – important for cookies carrying auth tokens
            if (options?.secure || window.location.protocol === 'https:') {
              cookieStr += '; Secure';
            }

            // IMPORTANT: The HttpOnly flag **cannot** be set from the browser.
            // To enforce HttpOnly you must refresh the cookie from the server.

            document.cookie = cookieStr;
          });
        },
      },
      // Sensible defaults – adjust to your needs
      cookieOptions: {
        name: 'sb-auth-token',
        path: '/',
        sameSite: 'lax',
        secure: true,
      },
    }
  );
}
