/**
 * GET  /api/categorias?cliente_id=<uuid>   — lista categorías de un cliente
 * POST /api/categorias                      — crea una nueva categoría
 *
 * Requiere sesión activa. El admin puede operar sobre cualquier cliente;
 * un cliente solo puede leer/crear sus propias categorías.
 */
import type { APIRoute } from 'astro';
import { createServerClient } from '../../../db/supabase';
import type { CategoriaInsert } from '../../../types/database';

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

// ── GET ───────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ cookies, request, url }) => {
  const { user, rol, supabase, authError } = await getSessionAndRole(cookies, request);
  if (authError) return authError;

  const clienteId = url.searchParams.get('cliente_id')?.trim();
  if (!clienteId) return json({ ok: false, error: 'Parámetro cliente_id requerido.' }, 400);

  // Un cliente solo puede ver sus propias categorías
  if (rol === 'cliente') {
    const { data: clienteRow } = await supabase!
      .from('clientes')
      .select('id')
      .eq('user_id', user!.id)
      .single();

    if (clienteRow?.id !== clienteId) {
      return json({ ok: false, error: 'Acceso denegado a las categorías de ese cliente.' }, 403);
    }
  }

  const { data, error } = await supabase!
    .from('categorias')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('orden', { ascending: true });

  if (error) return json({ ok: false, error: error.message, details: error.details }, 500);
  return json({ ok: true, data });
};

// ── POST ──────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ cookies, request }) => {
  const { user, rol, supabase, authError } = await getSessionAndRole(cookies, request);
  if (authError) return authError;

  let body: Partial<CategoriaInsert>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Body JSON inválido.' }, 400);
  }

  const { id, cliente_id, nombre, icono, gradiente, orden } = body;

  // ── Validación ───────────────────────────────────────────────
  if (!id?.trim())         return json({ ok: false, error: 'id es obligatorio.' }, 400);
  if (!cliente_id?.trim()) return json({ ok: false, error: 'cliente_id es obligatorio.' }, 400);
  if (!nombre?.trim())     return json({ ok: false, error: 'nombre es obligatorio.' }, 400);
  if (!icono?.trim())      return json({ ok: false, error: 'icono es obligatorio.' }, 400);
  if (!gradiente?.trim())  return json({ ok: false, error: 'gradiente es obligatorio.' }, 400);

  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(id.trim())) {
    return json({ ok: false, error: 'id solo puede contener letras, números, - y _ (máx 50 chars).' }, 400);
  }

  // Un cliente solo puede crear categorías en su propio registro
  if (rol === 'cliente') {
    const { data: clienteRow } = await supabase!
      .from('clientes')
      .select('id')
      .eq('user_id', user!.id)
      .single();

    if (clienteRow?.id !== cliente_id.trim()) {
      return json({ ok: false, error: 'No puedes crear categorías para otro cliente.' }, 403);
    }
  }

  // Calcular orden automático si no se proporcionó
  let ordenFinal = orden ?? 0;
  if (orden === undefined) {
    const { count } = await supabase!
      .from('categorias')
      .select('*', { count: 'exact', head: true })
      .eq('cliente_id', cliente_id.trim());
    ordenFinal = (count ?? 0) + 1;
  }

  const payload: CategoriaInsert = {
    id:         id.trim(),
    cliente_id: cliente_id.trim(),
    nombre:     nombre.trim().slice(0, 100),
    icono:      icono.trim().slice(0, 20),
    gradiente:  gradiente.trim().slice(0, 100),
    orden:      ordenFinal,
  };

  const { data, error } = await supabase!
    .from('categorias')
    .insert([payload])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return json({ ok: false, error: `Ya existe una categoría con id "${id}".` }, 409);
    if (error.code === '23503') return json({ ok: false, error: 'cliente_id no existe en la tabla clientes.' }, 400);
    return json({ ok: false, error: error.message, details: error.details }, 500);
  }

  return json({ ok: true, data }, 201);
};
