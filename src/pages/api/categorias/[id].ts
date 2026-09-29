/**
 * GET    /api/categorias/:id   — obtiene una categoría por id
 * PATCH  /api/categorias/:id   — actualiza nombre / icono / gradiente / orden
 * DELETE /api/categorias/:id   — elimina la categoría (cascada a platos por FK)
 *
 * Requiere sesión activa. Los clientes solo pueden operar sus propias categorías.
 */
import type { APIRoute } from 'astro';
import { createServerClient } from '../../../db/supabase';
import type { CategoriaUpdate } from '../../../types/database';

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
  const rol = (perfil?.rol === 'admin' ? 'admin' : 'cliente') as 'admin' | 'cliente';
  return { user, rol, supabase, authError: null };
}

/** Verifica que el cliente autenticado sea dueño de esta categoría. */
async function assertOwnership(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  categoriaId: string
) {
  const { data: cat } = await supabase
    .from('categorias')
    .select('cliente_id')
    .eq('id', categoriaId)
    .single();

  if (!cat) return false;

  const { data: clienteRow } = await supabase
    .from('clientes')
    .select('id')
    .eq('user_id', userId)
    .single();

  return clienteRow?.id === cat.cliente_id;
}

// ── GET ───────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ cookies, params, request }) => {
  const { user, rol, supabase, authError } = await getSessionAndRole(cookies, request);
  if (authError) return authError;

  const { id } = params;
  if (!id) return json({ ok: false, error: 'id requerido.' }, 400);

  const { data, error } = await supabase!
    .from('categorias')
    .select('*')
    .eq('id', id)
    .single();

  if (error?.code === 'PGRST116') return json({ ok: false, error: 'Categoría no encontrada.' }, 404);
  if (error) return json({ ok: false, error: error.message }, 500);

  if (rol === 'cliente') {
    const owns = await assertOwnership(supabase!, user!.id, id);
    if (!owns) return json({ ok: false, error: 'Acceso denegado.' }, 403);
  }

  return json({ ok: true, data });
};

// ── PATCH ─────────────────────────────────────────────────────────

export const PATCH: APIRoute = async ({ cookies, params, request }) => {
  const { user, rol, supabase, authError } = await getSessionAndRole(cookies, request);
  if (authError) return authError;

  const { id } = params;
  if (!id) return json({ ok: false, error: 'id requerido.' }, 400);

  if (rol === 'cliente') {
    const owns = await assertOwnership(supabase!, user!.id, id);
    if (!owns) return json({ ok: false, error: 'Acceso denegado.' }, 403);
  }

  let body: CategoriaUpdate;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Body JSON inválido.' }, 400);
  }

  if (Object.keys(body).length === 0) {
    return json({ ok: false, error: 'Debes enviar al menos un campo para actualizar.' }, 400);
  }

  // Solo campos editables
  const allowed: CategoriaUpdate = {};
  if (body.nombre    !== undefined) allowed.nombre    = body.nombre.trim().slice(0, 100);
  if (body.icono     !== undefined) allowed.icono     = body.icono.trim().slice(0, 20);
  if (body.gradiente !== undefined) allowed.gradiente = body.gradiente.trim().slice(0, 100);
  if (body.orden     !== undefined) allowed.orden     = Number(body.orden);

  const { data, error } = await supabase!
    .from('categorias')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error?.code === 'PGRST116') return json({ ok: false, error: 'Categoría no encontrada.' }, 404);
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
    .from('categorias')
    .select('id, nombre, cliente_id')
    .eq('id', id)
    .single();

  if (fetchError?.code === 'PGRST116') return json({ ok: false, error: 'Categoría no encontrada.' }, 404);
  if (fetchError) return json({ ok: false, error: fetchError.message }, 500);

  if (rol === 'cliente') {
    const owns = await assertOwnership(supabase!, user!.id, id);
    if (!owns) return json({ ok: false, error: 'Acceso denegado.' }, 403);
  }

  const { error } = await supabase!.from('categorias').delete().eq('id', id);
  if (error) return json({ ok: false, error: error.message, details: error.details }, 500);

  return json({ ok: true, data: { id, nombre: existing.nombre } });
};
