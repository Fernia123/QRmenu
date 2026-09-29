/**
 * GET    /api/clientes/:id   — obtiene un cliente por id
 * PATCH  /api/clientes/:id   — actualiza campos de un cliente
 * DELETE /api/clientes/:id   — elimina un cliente
 *
 * Requiere sesión activa con rol 'admin'.
 */
import type { APIRoute } from 'astro';
import { createServerClient } from '../../../db/supabase';
import type { ClienteUpdate } from '../../../types/database';

// ── Helpers ──────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function requireAdmin(cookies: Parameters<typeof createServerClient>[0], request: Request) {
  const supabase = createServerClient(cookies, request);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, supabase, authError: json({ ok: false, error: 'No autenticado.' }, 401) };

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single();
  if (perfil?.rol !== 'admin') return { user: null, supabase, authError: json({ ok: false, error: 'Acceso denegado.' }, 403) };

  return { user, supabase, authError: null };
}

// ── GET ───────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ cookies, params, request }) => {
  const { supabase, authError } = await requireAdmin(cookies, request);
  if (authError) return authError;

  const { id } = params;
  if (!id) return json({ ok: false, error: 'id requerido.' }, 400);

  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single();

  if (error?.code === 'PGRST116') return json({ ok: false, error: 'Cliente no encontrado.' }, 404);
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, data });
};

// ── PATCH ─────────────────────────────────────────────────────────

export const PATCH: APIRoute = async ({ cookies, params, request }) => {
  const { supabase, authError } = await requireAdmin(cookies, request);
  if (authError) return authError;

  const { id } = params;
  if (!id) return json({ ok: false, error: 'id requerido.' }, 400);

  let body: ClienteUpdate;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Body JSON inválido.' }, 400);
  }

  if (Object.keys(body).length === 0) {
    return json({ ok: false, error: 'Debes enviar al menos un campo para actualizar.' }, 400);
  }

  // Sanitizar campos permitidos
  const allowed: ClienteUpdate = {};
  if (body.nombre_restaurante !== undefined) allowed.nombre_restaurante = body.nombre_restaurante.trim();
  if (body.slug               !== undefined) {
    const s = body.slug.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,80}$/.test(s)) {
      return json({ ok: false, error: 'slug inválido. Solo minúsculas, números y guiones.' }, 400);
    }
    allowed.slug = s;
  }
  if (body.telefono    !== undefined) allowed.telefono    = body.telefono?.trim() || null;
  if (body.fecha_inicio !== undefined) allowed.fecha_inicio = body.fecha_inicio;
  if (body.fecha_pago   !== undefined) allowed.fecha_pago   = body.fecha_pago;
  if (body.estado       !== undefined) allowed.estado       = body.estado;
  if (body.user_id      !== undefined) allowed.user_id      = body.user_id;

  const { data, error } = await supabase
    .from('clientes')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error?.code === 'PGRST116') return json({ ok: false, error: 'Cliente no encontrado.' }, 404);
  if (error?.code === '23505')    return json({ ok: false, error: 'Ese slug ya está en uso.' }, 409);
  if (error) return json({ ok: false, error: error.message, details: error.details }, 500);

  return json({ ok: true, data });
};

// ── DELETE ────────────────────────────────────────────────────────

export const DELETE: APIRoute = async ({ cookies, params, request }) => {
  const { supabase, authError } = await requireAdmin(cookies, request);
  if (authError) return authError;

  const { id } = params;
  if (!id) return json({ ok: false, error: 'id requerido.' }, 400);

  // Verificar que existe antes de eliminar
  const { data: existing, error: fetchError } = await supabase
    .from('clientes')
    .select('id, nombre_restaurante')
    .eq('id', id)
    .single();

  if (fetchError?.code === 'PGRST116') return json({ ok: false, error: 'Cliente no encontrado.' }, 404);
  if (fetchError) return json({ ok: false, error: fetchError.message }, 500);

  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) return json({ ok: false, error: error.message, details: error.details }, 500);

  return json({ ok: true, data: { id, nombre_restaurante: existing.nombre_restaurante } });
};
