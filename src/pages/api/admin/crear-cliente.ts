import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../db/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

function todayISO(offsetYears = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + offsetYears);
  return d.toISOString().slice(0, 10);
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'restaurante'
  );
}

async function crearSlugUnico(base: string, fallbackId: string): Promise<string> {
  const first = slugify(base);
  const candidates = [
    first,
    `${first}-2`,
    `${first}-3`,
    `${first}-4`,
    `${first}-5`,
    `restaurante-${fallbackId.slice(0, 8)}`,
  ];

  let index = 0;
  let slug = `restaurante-${fallbackId.slice(0, 8)}`;
  while (index < candidates.length) {
    const { data } = await supabaseAdmin!
      .from('clientes')
      .select('id')
      .eq('slug', candidates[index])
      .maybeSingle();
    if (!data) {
      slug = candidates[index];
      break;
    }
    index += 1;
  }
  return slug;
}
export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { nombre_restaurante, telefono, email, password, estado } = data;

    const supabaseAdmin = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.SUPABASE_SECRET_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Validación básica
    if (!nombre_restaurante || !email || !password) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos obligatorios (nombre del restaurante, email y contraseña).' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!supabaseAdmin) {
      return new Response(
        JSON.stringify({
          error: 'Supabase Admin no está configurado en el servidor. Configura SUPABASE_SERVICE_ROLE_KEY en el archivo .env.'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nombre_restaurante,
        role: 'cliente',
      },
    });

    console.log('--- DATOS RECIBIDOS EN CREAR CLIENTE ---');
    console.log('Email:', email);
    console.log('Password length:', password?.length);
    console.log('¿Existe Service Role Key?:', !!import.meta.env.SUPABASE_SERVICE_ROLE_KEY);

    if (authError ) {
      let mensaje = authError.message;
      if (mensaje.includes('already registered') || mensaje.includes('already been registered')) {
        mensaje = 'Ya existe un usuario con ese correo electrónico.';
      }
      return new Response(
        JSON.stringify({ error: mensaje }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = authData.user?.id;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'No se pudo obtener el ID del usuario creado.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Perfil (el trigger lo crea solo, pero usar upsert para robustez)
    const { error: perfilError } = await supabaseAdmin
      .from('perfiles')
      .upsert(
        [
          {
            id: userId,
            email,
            rol: 'cliente',
            created_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'id' }
      );

    if (perfilError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: `Error al crear el perfil: ${perfilError.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Insertar en tabla clientes (vinculado por user_id)
    const slug = await crearSlugUnico(nombre_restaurante, userId);
    const { data: nuevoCliente, error: clienteError } = await supabaseAdmin
      .from('clientes')
      .insert([{
        user_id: userId,
        nombre_restaurante: String(nombre_restaurante).trim().slice(0, 150),
        slug,
        telefono: telefono?.toString().trim() || null,
        fecha_inicio: todayISO(),
        fecha_pago: todayISO(1),
        estado: estado ?? true,
      }])
      .select()
      .single();

    if (clienteError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: `Usuario creado pero error al guardar datos: ${clienteError.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, cliente: nuevoCliente }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Error en /api/admin/crear-cliente:', err);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};