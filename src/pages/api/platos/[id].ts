/**
 * GET    /api/platos/:id   — obtiene un plato por id (UUID)
 * PATCH  /api/platos/:id   — actualiza nombre/precio/descripción/disponibilidad/etc.
 * DELETE /api/platos/:id   — elimina un plato
 *
 * Requiere sesión activa. Los clientes solo pueden operar sus propios platos.
 */
import type { APIRoute } from 'astro';
import { createServerClient } from '../../../db/supabase';
import type { PlatoUpdate } from '../../../types/database';

// ── Helpers ──────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getSessionAndRole(cookies: Parameters<typeof createServerClient>[0], request: Request) {
  const supabase = createServerClient(cookies, request);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, rol: null, supabase, authError: json({ ok: false, error: 'No autenticado.' }, 401) };

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single();
  const rol = (perfil?.rol ?? 'cliente') as 'admin' | 'cliente';
  return { user, rol, supabase, authError: null };
}

/** Devuelve el cliente_id del plato si existe, o null. */
async function getPlatoClienteId(
  supabase: ReturnType<typeof createServerClient>,
  platoId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('platos')
    .select('cliente_id')
    .eq('id', platoId)
    .single();
  return data?.cliente_id ?? null;
}

/** Devuelve el cliente_id vinculado al user_id autenticado. */
async function getClienteIdForUser(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('clientes')
    .select('id')
    .eq('user_id', userId)
    .single();
  return data?.id ?? null;
}

// ── GET ───────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ cookies, params, request }) => {
  const { user, rol, supabase, authError } = await getSessionAndRole(cookies, request);
  if (authError) return authError;

  const { id } = params;
  if (!id) return json({ ok: false, error: 'id requerido.' }, 400);

  const { data, error } = await supabase!
    .from('platos')
    .select('*')
    .eq('id', id)
    .single();

  if (error?.code === 'PGRST116') return json({ ok: false, error: 'Plato no encontrado.' }, 404);
  if (error) return json({ ok: false, error: error.message }, 500);

  if (rol === 'cliente') {
    const propioClienteId = await getClienteIdForUser(supabase!, user!.id);
    if (data.cliente_id !== propioClienteId) {
      return json({ ok: false, error: 'Acceso denegado.' }, 403);
    }
  }

  return json({ ok: true, data });
};

// ── PATCH ─────────────────────────────────────────────────────────

export const PATCH: APIRoute = async ({ cookies, params, request }) => {
  const { user, rol, supabase, authError } = await getSessionAndRole(cookies, request);
  if (authError) return authError;

  const { id } = params;
  if (!id) return json({ ok: false, error: 'id requerido.' }, 400);

  // Verificar propiedad para clientes
  if (rol === 'cliente') {
    const platoClienteId = await getPlatoClienteId(supabase!, id);
    if (!platoClienteId) return json({ ok: false, error: 'Plato no encontrado.' }, 404);
    const propioClienteId = await getClienteIdForUser(supabase!, user!.id);
    if (platoClienteId !== propioClienteId) return json({ ok: false, error: 'Acceso denegado.' }, 403);
  }

  let body: PlatoUpdate;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Body JSON inválido.' }, 400);
  }

  if (Object.keys(body).length === 0) {
    return json({ ok: false, error: 'Debes enviar al menos un campo para actualizar.' }, 400);
  }

  // Solo campos editables (cliente_id no se puede cambiar)
  const allowed: PlatoUpdate = {};
  if (body.nombre       !== undefined) allowed.nombre       = body.nombre.trim().slice(0, 150);
  if (body.descripcion  !== undefined) allowed.descripcion  = body.descripcion.trim();
  if (body.precio       !== undefined) {
    const p = Number(body.precio);
    if (isNaN(p) || p < 0) return json({ ok: false, error: 'precio debe ser un número mayor o igual a 0.' }, 400);
    allowed.precio = Number(p.toFixed(2));
  }
  if (body.categoria_id !== undefined) allowed.categoria_id = body.categoria_id.trim();
  if (body.imagen_url   !== undefined) allowed.imagen_url   = body.imagen_url?.trim() || null;
  if (body.disponible   !== undefined) allowed.disponible   = Boolean(body.disponible);
  if (body.destacado    !== undefined) allowed.destacado    = Boolean(body.destacado);

  const { data, error } = await supabase!
    .from('platos')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error?.code === 'PGRST116') return json({ ok: false, error: 'Plato no encontrado.' }, 404);
  if (error?.code === '23503')    return json({ ok: false, error: 'categoria_id no existe.' }, 400);
  if (error) return json({ ok: false, error: error.message, details: error.details }, 500);

  return json({ ok: true, data });
};

// ── DELETE ────────────────────────────────────────────────────────

export const DELETE: APIRoute = async ({ cookies, params, request }) => {
  const { user, rol, supabase, authError } = await getSessionAndRole(cookies, request);
  if (authError) return authError;

  const { id } = params;
  if (!id) return json({ ok: false, error: 'id requerido.' }, 400);

  // Verificar existencia
  const { data: existing, error: fetchError } = await supabase!
    .from('platos')
    .select('id, nombre, cliente_id')
    .eq('id', id)
    .single();

  if (fetchError?.code === 'PGRST116') return json({ ok: false, error: 'Plato no encontrado.' }, 404);
  if (fetchError) return json({ ok: false, error: fetchError.message }, 500);

  if (rol === 'cliente') {
    const propioClienteId = await getClienteIdForUser(supabase!, user!.id);
    if (existing.cliente_id !== propioClienteId) {
      return json({ ok: false, error: 'Acceso denegado.' }, 403);
    }
  }

  const { error } = await supabase!.from('platos').delete().eq('id', id);
  if (error) return json({ ok: false, error: error.message, details: error.details }, 500);

  return json({ ok: true, data: { id, nombre: existing.nombre } });
};
