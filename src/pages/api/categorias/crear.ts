/**
 * POST /api/categorias/crear — crea una nueva categoría
 *
 * Implementa autenticación SSR con @supabase/ssr:
 * · Lee las cookies de la request con parseCookieHeader
 * · Valida la sesión del usuario
 * · Obtiene el cliente_id asociado al user.id
 * · Genera ID automático si no se proporciona
 * · Inserta la categoría con valores por defecto
 */
import type { APIRoute } from 'astro';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // 1. Instanciar Supabase leyendo las cookies enviadas por 'credentials: include'
    const supabase = createServerClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return parseCookieHeader(request.headers.get('Cookie') ?? '');
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // 2. Obtener la sesión del usuario
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'No autenticado. Por favor, vuelve a iniciar sesión.' }),
        { status: 401 }
      );
    }

    // 3. Obtener el cliente_id asociado a este user.id
    const { data: cliente, error: clienteError } = await supabase
      .from('clientes')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (clienteError || !cliente) {
      return new Response(
        JSON.stringify({ error: 'No se encontró un perfil de cliente asociado a este usuario.' }),
        { status: 403 }
      );
    }

    // 4. Leer el body
    const body = await request.json();
    const { id, nombre, icono, gradiente } = body;

    if (!nombre) {
      return new Response(
        JSON.stringify({ error: 'El nombre de la categoría es obligatorio.' }),
        { status: 400 }
      );
    }

    // 5. Generar ID automático si no se proporcionó
    let categoriaId = typeof id === 'string' && id.trim() ? id.trim().slice(0, 50) : '';

    if (categoriaId) {
      // Validar formato del ID manual
      if (!/^[a-zA-Z0-9_-]{1,50}$/.test(categoriaId)) {
        return new Response(
          JSON.stringify({ error: 'ID solo puede contener letras, números, guiones y guiones bajos (máx. 50 caracteres).' }),
          { status: 400 }
        );
      }
    } else {
      // Generar ID desde el nombre
      const base = slugify(nombre) || `cat-${Date.now().toString(36)}`;
      let candidate = base;
      let n = 2;

      // Evitar colisiones de ID
      for (;;) {
        const { count } = await supabase
          .from('categorias')
          .select('*', { count: 'exact', head: true })
          .eq('id', candidate);
        
        if (!count) break;
        candidate = `${base}-${n++}`;
      }
      categoriaId = candidate;
    }

    // 6. Insertar la categoría
    const { data: nuevaCategoria, error: insertError } = await supabase
      .from('categorias')
      .insert([
        { 
          id: categoriaId,
          nombre, 
          icono: icono || '📁', 
          gradiente: gradiente || 'from-ink-100 to-ink-200',
          cliente_id: cliente.id 
        }
      ])
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 400 }
      );
    }

    return new Response(
      JSON.stringify({ success: true, categoria: nuevaCategoria }),
      { status: 200 }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Error interno en el servidor' }),
      { status: 500 }
    );
  }
};
