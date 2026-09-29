/**
 * src/scripts/auth.ts
 *
 * Utilidades de autenticación para scripts del NAVEGADOR.
 * Lee el rol desde la tabla `perfiles` (fuente de verdad), con fallback
 * a user_metadata.role para mayor velocidad en la primera carga.
 *
 * Uso típico en el <script> de una página .astro:
 *
 *   import { requireAuth, initLogout } from '../scripts/auth';
 *   await requireAuth('admin');   // redirige si no es admin
 *   initLogout();                 // activa botones [data-logout]
 */

import { supabase, isSupabaseConfigured } from '../db/supabase';
import type { Rol } from '../types/database';

// ── Tipos ─────────────────────────────────────────────────────────
export type { Rol };

// ── Helpers internos ──────────────────────────────────────────────

/**
 * Devuelve el rol del usuario autenticado consultando primero
 * la tabla `perfiles`. Si la consulta falla usa user_metadata como
 * fallback y considera 'cliente' como rol por defecto.
 */
async function getRolFromSession(): Promise<{ rol: Rol; userId: string } | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  // 1. Intentar tabla perfiles (fuente de verdad)
  const { data: perfil, error: perfilError } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single();

  // Normalizar "admin." → "admin" (el trigger anterior guardaba el rol con punto).
  const rolPerfil = perfil?.rol === 'admin' || perfil?.rol === 'admin.' ? 'admin' : 'cliente';

  if (perfil && !perfilError) {
    return { rol: rolPerfil as Rol, userId: user.id };
  }

  // 2. Fallback: user_metadata.role (útil cuando el trigger aún no corrió)
  const metaRole = user.user_metadata?.role;
  const rol: Rol = metaRole === 'admin' ? 'admin' : 'cliente';
  return { rol, userId: user.id };
}

/** Destino de redirección según rol. */
function homeForRol(rol: Rol): string {
  return rol === 'admin' ? '/admin' : '/dashboard';
}

// ── API pública ───────────────────────────────────────────────────

/**
 * Protege una ruta privada.
 * - Sin sesión → redirige a /login.
 * - Con rol incorrecto → redirige al panel que le corresponde.
 * - En modo demo (Supabase no configurado) no bloquea.
 *
 * @param requiredRole  'admin' | 'cliente' | undefined (solo verifica sesión)
 */
export async function requireAuth(requiredRole?: Rol): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  const result = await getRolFromSession();

  if (!result) {
    window.location.replace('/login');
    return;
  }

  if (requiredRole && result.rol !== requiredRole) {
    window.location.replace(homeForRol(result.rol));
  }
}

/**
 * En páginas públicas (login, landing): si ya hay sesión activa
 * redirige directamente al panel correspondiente.
 */
export async function redirectIfAuthed(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  const result = await getRolFromSession();
  if (result) {
    window.location.replace(homeForRol(result.rol));
  }
}

/**
 * Devuelve el rol del usuario activo, o null si no hay sesión.
 * Útil para mostrar/ocultar elementos de UI sin redirigir.
 */
export async function getCurrentRol(): Promise<Rol | null> {
  const result = await getRolFromSession();
  return result?.rol ?? null;
}

/**
 * Devuelve el user_id y el rol del usuario activo, o null.
 * Útil para cargar datos filtrados por cliente.
 */
export async function getCurrentUser(): Promise<{ userId: string; rol: Rol } | null> {
  const result = await getRolFromSession();
  if (!result) return null;
  return { userId: result.userId, rol: result.rol };
}

/**
 * Convierte cualquier elemento con el atributo [data-logout] en un
 * botón de cierre de sesión. Llamar una vez en el DOMContentLoaded.
 *
 * @example
 *   <button data-logout>Cerrar sesión</button>
 */
export function initLogout(): void {
  document.querySelectorAll<HTMLElement>('[data-logout]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!isSupabaseConfigured || !supabase) {
        window.location.href = '/login';
        return;
      }
      await supabase.auth.signOut();
      window.location.href = '/login';
    });
  });
}

/**
 * @deprecated  Usar getCurrentRol() o getRolFromSession() internamente.
 * Mantenido por compatibilidad con código existente.
 */
export function roleFromUser(
  user: { user_metadata?: Record<string, unknown> } | null | undefined
): Rol {
  return user?.user_metadata?.role === 'admin' ? 'admin' : 'cliente';
}
