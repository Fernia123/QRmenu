/**
 * GET  /api/platos?cliente_id=<uuid>&categoria_id=<id>&disponible=true
 *   — lista platos con filtros opcionales
 * POST /api/platos
 *   — crea un nuevo plato
 *
 * Requiere sesión activa. Clientes solo operan sus propios platos.
 */
import type { APIRoute } from 'astro';
import { createServerClient } from '../../../db/supabase';
import type { PlatoInsert } from '../../../types/database';

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

export const GET: APIRoute = async ({ cookies, request, url }) => {
  const { user, rol, supabase, authError } = await getSessionAndRole(cookies, request);
  if (authError) return authError;

  const clienteId    = url.searchParams.get('cliente_id')?.trim();
  const categoriaId  = url.searchParams.get('categoria_id')?.trim();
  const disponibleQS = url.searchParams.get('disponible');
  const destacadoQS  = url.searchParams.get('destacado');
  const search       = url.searchParams.get('search')?.trim() ?? '';

  // Un cliente solo puede ver sus propios platos
  if (rol === 'cliente') {
    const propioClienteId = await getClienteIdForUser(supabase!, user!.id);
    if (!propioClienteId) return json({ ok: false, error: 'No tienes un perfil de cliente asociado.' }, 403);
    if (clienteId && clienteId !== propioClienteId) {
      return json({ ok: false, error: 'Acceso denegado a los platos de ese cliente.' }, 403);
    }
  }

  let query = supabase!
    .from('platos')
    .select('*')
    .order('created_at', { ascending: false });

  if (clienteId)   query = query.eq('cliente_id', clienteId);
  if (categoriaId) query = query.eq('categoria_id', categoriaId);
  if (disponibleQS !== null) query = query.eq('disponible', disponibleQS === 'true');
  if (destacadoQS  !== null) query = query.eq('destacado',  destacadoQS  === 'true');
  if (search)      query = query.ilike('nombre', `%${search}%`);

  const { data, error } = await query;

  if (error) return json({ ok: false, error: error.message, details: error.details }, 500);
  return json({ ok: true, data });
};

// ── POST ──────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ cookies, request }) => {
  const { user, rol, supabase, authError } = await getSessionAndRole(cookies, request);
  if (authError) return authError;

  let body: Partial<PlatoInsert>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Body JSON inválido.' }, 400);
  }

  const { categoria_id, cliente_id, nombre, descripcion, precio, imagen_url, disponible, destacado } = body;

  // ── Validación ───────────────────────────────────────────────
  if (!categoria_id?.trim()) return json({ ok: false, error: 'categoria_id es obligatorio.' }, 400);
  if (!cliente_id?.trim())   return json({ ok: false, error: 'cliente_id es obligatorio.' }, 400);
  if (!nombre?.trim())       return json({ ok: false, error: 'nombre es obligatorio.' }, 400);
  if (precio === undefined || isNaN(Number(precio)) || Number(precio) < 0) {
    return json({ ok: false, error: 'precio debe ser un número mayor o igual a 0.' }, 400);
  }

  // Un cliente solo puede crear platos en su propio registro
  if (rol === 'cliente') {
    const propioClienteId = await getClienteIdForUser(supabase!, user!.id);
    if (propioClienteId !== cliente_id.trim()) {
      return json({ ok: false, error: 'No puedes crear platos para otro cliente.' }, 403);
    }
  }

  const payload: PlatoInsert = {
    categoria_id: categoria_id.trim(),
    cliente_id:   cliente_id.trim(),
    nombre:       nombre.trim().slice(0, 150),
    descripcion:  descripcion?.trim() ?? '',
    precio:       Number(Number(precio).toFixed(2)),
    imagen_url:   imagen_url?.trim() || null,
    disponible:   disponible ?? true,
    destacado:    destacado ?? false,
  };

  const { data, error } = await supabase!
    .from('platos')
    .insert([payload])
    .select()
    .single();

  if (error) {
    if (error.code === '23503') {
      return json({ ok: false, error: 'categoria_id o cliente_id no existe.' }, 400);
    }
    return json({ ok: false, error: error.message, details: error.details }, 500);
  }

  return json({ ok: true, data }, 201);
};
