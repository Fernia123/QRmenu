/**
 * src/db/supabase.ts
 *
 * Exporta dos fábricas:
 *
 *  · createBrowserClient()  — cliente para componentes del navegador.
 *    Persiste la sesión en cookies (usa @supabase/ssr).
 *
 *  · createServerClient(cookies) — cliente para endpoints API / SSR.
 *    Lee y escribe las cookies de sesión desde el objeto AstroCookies.
 *
 * También re-exporta el cliente singleton legacy (supabase / isSupabaseConfigured)
 * para compatibilidad con el código existente que todavía lo importa.
 */

import {
  createBrowserClient as ssrBrowser,
  createServerClient as ssrServer,
} from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Variables de entorno ──────────────────────────────────────────
const SUPABASE_URL = (import.meta.env.PUBLIC_SUPABASE_URL ?? '').trim();
const SUPABASE_ANON_KEY = (import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  SUPABASE_URL.startsWith('http') &&
  !SUPABASE_URL.includes('tu-proyecto')
);

// ── 1. Cliente para el navegador (persiste sesión en cookies) ─────
/**
 * Usar en <script> de componentes Astro o en componentes de framework
 * (React, Vue…) que corren en el cliente.
 * 
 * Este cliente usa @supabase/ssr para persistir la sesión en cookies,
 * lo que permite que el servidor lea la sesión en endpoints API.
 */
export function createBrowserClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase no está configurado. Verifica PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY en .env');
  }
  
  return ssrBrowser(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        // En el navegador, leer cookies del document
        const cookies: { name: string; value: string }[] = [];
        if (typeof document !== 'undefined' && document.cookie) {
          document.cookie.split(';').forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            if (name) cookies.push({ name, value: decodeURIComponent(value || '') });
          });
        }
        return cookies;
      },
      setAll(cookiesToSet) {
        // En el navegador, escribir cookies en document
        if (typeof document !== 'undefined') {
          cookiesToSet.forEach(({ name, value, options }) => {
            let cookieStr = `${name}=${encodeURIComponent(value)}`;
            if (options?.path) cookieStr += `; path=${options.path}`;
            if (options?.domain) cookieStr += `; domain=${options.domain}`;
            if (options?.maxAge) cookieStr += `; max-age=${options.maxAge}`;
            if (options?.httpOnly) cookieStr += '; httpOnly';
            if (options?.secure) cookieStr += '; secure';
            if (options?.sameSite) cookieStr += `; sameSite=${options.sameSite}`;
            document.cookie = cookieStr;
          });
        }
      },
    },
  });
}

// ── 2. Cliente SSR para endpoints API (lee cookies de la request) ─
/**
 * Usar en src/pages/api/**.ts y en el frontmatter --- de páginas .astro.
 *
 * @example
 * // En un endpoint API:
 * import { createServerClient } from '../../db/supabase';
 * export const GET: APIRoute = async ({ cookies }) => {
 *   const supabase = createServerClient(cookies);
 *   const { data: { user } } = await supabase.auth.getUser();
 *   ...
 * };
 */
/**
 * Astro 7 no expone cookies.getAll() en AstroCookies, así que el adaptador
 * de @supabase/ssr lee el header crudo `cookie` desde la Request.
 */
function parseCookieHeader(raw: string | null): { name: string; value: string }[] {
  if (!raw) return [];
  const out: { name: string; value: string }[] = [];
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out.push({ name, value });
  }
  return out;
}

export function createServerClient(cookies: AstroCookies, request?: Request): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase no está configurado. Verifica las variables de entorno en .env');
  }

  return ssrServer(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request?.headers.get('cookie') ?? null);
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, {
            ...options,
            sameSite: options?.sameSite as 'strict' | 'lax' | 'none' | boolean | undefined,
          });
        });
      },
    },
  });
}

// ── 3. Singleton legacy (compatibilidad hacia atrás) ──────────────
/**
 * Cliente para el navegador con gestión de cookies SSR.
 * Usa createBrowserClient() de @supabase/ssr para persistir sesión.
 * 
 * NOTA: Este singleton se inicializa bajo demanda. Cada vez que se
 * importa, verifica si hay cookies de sesión disponibles.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createBrowserClient()
  : null;
