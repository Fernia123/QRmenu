/**
 * src/db/database.ts
 *
 * Capa de acceso a datos para el NAVEGADOR (scripts de páginas .astro).
 * Usa el singleton `supabase` (anon key) y cae a localStorage como fallback
 * cuando Supabase no está configurado o la red falla.
 *
 * Columnas mapeadas exactamente según la BD:
 *   clientes   → id, user_id, nombre_restaurante, slug, telefono,
 *                fecha_inicio, fecha_pago, estado, created_at, updated_at
 *   categorias → id, cliente_id, nombre, icono, gradiente, orden, created_at
 *   platos     → id, categoria_id, cliente_id, nombre, descripcion, precio,
 *                imagen_url, disponible, destacado, created_at, updated_at
 */

import { supabase, isSupabaseConfigured } from './supabase';
export type { Cliente } from '../types/database';
import type {
  Cliente,
  ClienteInsert,
  ClienteUpdate,
  Categoria,
  CategoriaInsert,
  CategoriaUpdate,
  Plato,
  PlatoInsert,
  PlatoUpdate,
} from '../types/database';

// ════════════════════════════════════════════════════════════════
// CLIENTES
// ════════════════════════════════════════════════════════════════

const CLIENTES_KEY = 'micarta:clientes:v2';

function getLocalClientes(): Cliente[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CLIENTES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEMO_CLIENTES;
}

function saveLocalClientes(list: Cliente[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(CLIENTES_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export const DEMO_CLIENTES: Cliente[] = [
  {
    id: 'demo-1', user_id: null,
    nombre_restaurante: 'Restaurante Juan', slug: 'restaurante-juan',
    telefono: '+51 999 111 222', fecha_inicio: '2024-01-01', fecha_pago: '2025-01-01',
    estado: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-2', user_id: null,
    nombre_restaurante: 'Café María', slug: 'cafe-maria',
    telefono: null, fecha_inicio: '2024-03-15', fecha_pago: '2025-03-15',
    estado: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-3', user_id: null,
    nombre_restaurante: 'Sushi Zen', slug: 'sushi-zen',
    telefono: '+51 987 654 321', fecha_inicio: '2023-11-01', fecha_pago: '2024-11-01',
    estado: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
];

/** Lee todos los clientes. Prioriza Supabase, cae a localStorage. */
export async function fetchClientes(): Promise<Cliente[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        saveLocalClientes(data as Cliente[]);
        return data as Cliente[];
      }
    } catch (err) {
      console.warn('[database] fetchClientes fallback local:', err);
    }
  }
  return getLocalClientes();
}

/** Crea un cliente. En modo demo inserta en localStorage. */
export async function addCliente(payload: ClienteInsert): Promise<Cliente> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([payload])
        .select()
        .single();
      if (!error && data) {
        const list = getLocalClientes();
        saveLocalClientes([data as Cliente, ...list]);
        return data as Cliente;
      }
      console.error('[database] addCliente Supabase error:', error?.message);
    } catch (err) {
      console.error('[database] addCliente exception:', err);
    }
  }
  // Fallback local
  const local: Cliente = {
    ...payload,
    id: `local-${Date.now()}`,
    estado: payload.estado ?? true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveLocalClientes([local, ...getLocalClientes()]);
  return local;
}

/** Actualiza campos de un cliente por id. */
export async function updateCliente(id: string, patch: ClienteUpdate): Promise<Cliente | null> {
  // Actualizar local primero (optimistic)
  const list = getLocalClientes();
  const idx = list.findIndex(c => c.id === id);
  let updated: Cliente | null = null;
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...patch, updated_at: new Date().toISOString() };
    updated = list[idx];
    saveLocalClientes(list);
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) return data as Cliente;
      console.error('[database] updateCliente error:', error?.message);
    } catch (err) {
      console.error('[database] updateCliente exception:', err);
    }
  }
  return updated;
}

/** Alterna el estado activo/inactivo de un cliente. */
export async function toggleClienteEstado(id: string): Promise<Cliente | null> {
  const list = getLocalClientes();
  const target = list.find(c => c.id === id);
  if (!target) return null;
  return updateCliente(id, { estado: !target.estado });
}

/** Elimina un cliente por id. */
export async function deleteCliente(id: string): Promise<boolean> {
  const list = getLocalClientes();
  saveLocalClientes(list.filter(c => c.id !== id));

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) { console.error('[database] deleteCliente error:', error.message); return false; }
    } catch (err) {
      console.error('[database] deleteCliente exception:', err);
    }
  }
  return true;
}

// ════════════════════════════════════════════════════════════════
// CATEGORÍAS
// ════════════════════════════════════════════════════════════════

const CATS_KEY = 'micarta:categorias:v2';

function getLocalCategorias(): Categoria[] {
  if (typeof window === 'undefined') return DEMO_CATEGORIAS;
  try {
    const raw = localStorage.getItem(CATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEMO_CATEGORIAS;
}

function saveLocalCategorias(list: Categoria[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(CATS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export const DEMO_CATEGORIAS: Categoria[] = [
  { id: 'c1', cliente_id: 'demo-1', nombre: 'Hamburguesas', icono: '🍔', gradiente: 'from-orange-100 to-amber-200', orden: 1, created_at: new Date().toISOString() },
  { id: 'c2', cliente_id: 'demo-1', nombre: 'Pizzas',       icono: '🍕', gradiente: 'from-red-100 to-orange-100',   orden: 2, created_at: new Date().toISOString() },
  { id: 'c3', cliente_id: 'demo-1', nombre: 'Bebidas',      icono: '🥤', gradiente: 'from-blue-100 to-cyan-100',    orden: 3, created_at: new Date().toISOString() },
  { id: 'c4', cliente_id: 'demo-1', nombre: 'Postres',      icono: '🍰', gradiente: 'from-pink-100 to-purple-100',  orden: 4, created_at: new Date().toISOString() },
];

/** Lista categorías. Con clienteId filtra por ese cliente; sin argumento lista todas. */
export async function fetchCategorias(clienteId?: string | null): Promise<Categoria[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase
        .from('categorias')
        .select('*')
        .order('orden', { ascending: true });
      if (clienteId) query = query.eq('cliente_id', clienteId);

      const { data, error } = await query;
      if (!error && data) {
        saveLocalCategorias(data as Categoria[]);
        return data as Categoria[];
      }
    } catch (err) {
      console.warn('[database] fetchCategorias fallback local:', err);
    }
  }
  const all = getLocalCategorias();
  return clienteId ? all.filter(c => c.cliente_id === clienteId) : all;
}

/** Crea una categoría. */
export async function addCategoria(payload: CategoriaInsert): Promise<Categoria> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('categorias')
        .insert([payload])
        .select()
        .single();
      if (!error && data) {
        saveLocalCategorias([data as Categoria, ...getLocalCategorias()]);
        return data as Categoria;
      }
      console.error('[database] addCategoria error:', error?.message);
    } catch (err) {
      console.error('[database] addCategoria exception:', err);
    }
  }
  const local: Categoria = { ...payload, orden: payload.orden ?? 1, created_at: new Date().toISOString() };
  saveLocalCategorias([...getLocalCategorias(), local]);
  return local;
}

/** Actualiza nombre / icono / gradiente / orden de una categoría. */
export async function updateCategoria(id: string, patch: CategoriaUpdate): Promise<Categoria | null> {
  const list = getLocalCategorias();
  const idx = list.findIndex(c => c.id === id);
  let updated: Categoria | null = null;
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...patch };
    updated = list[idx];
    saveLocalCategorias(list);
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('categorias')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) return data as Categoria;
      console.error('[database] updateCategoria error:', error?.message);
    } catch (err) {
      console.error('[database] updateCategoria exception:', err);
    }
  }
  return updated;
}

/** Elimina una categoría. */
export async function deleteCategoria(id: string): Promise<boolean> {
  saveLocalCategorias(getLocalCategorias().filter(c => c.id !== id));

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from('categorias').delete().eq('id', id);
      if (error) { console.error('[database] deleteCategoria error:', error.message); return false; }
    } catch (err) {
      console.error('[database] deleteCategoria exception:', err);
    }
  }
  return true;
}

// ════════════════════════════════════════════════════════════════
// PLATOS
// ════════════════════════════════════════════════════════════════

const PLATOS_KEY = 'micarta:platos:v2';

function getLocalPlatos(): Plato[] {
  if (typeof window === 'undefined') return DEMO_PLATOS;
  try {
    const raw = localStorage.getItem(PLATOS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEMO_PLATOS;
}

function saveLocalPlatos(list: Plato[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(PLATOS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export const DEMO_PLATOS: Plato[] = [
  { id: 'd1', categoria_id: 'c1', cliente_id: 'demo-1', nombre: 'Clásica BBQ',         descripcion: 'Carne, queso cheddar, cebolla caramelizada',  precio: 18.90, imagen_url: null, disponible: true,  destacado: true,  created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'd2', categoria_id: 'c1', cliente_id: 'demo-1', nombre: 'Doble Americana',      descripcion: 'Doble carne, doble queso, pepinillos',           precio: 24.50, imagen_url: null, disponible: true,  destacado: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'd3', categoria_id: 'c2', cliente_id: 'demo-1', nombre: 'Margherita',           descripcion: 'Tomate, mozzarella, albahaca fresca',            precio: 22.00, imagen_url: null, disponible: true,  destacado: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'd4', categoria_id: 'c3', cliente_id: 'demo-1', nombre: 'Limonada de hierbabuena', descripcion: 'Limón, hierbabuena, azúcar, agua mineral',   precio: 8.50,  imagen_url: null, disponible: true,  destacado: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'd5', categoria_id: 'c4', cliente_id: 'demo-1', nombre: 'Brownie con helado',   descripcion: 'Brownie tibio, helado de vainilla, salsa de chocolate', precio: 12.00, imagen_url: null, disponible: false, destacado: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

/** Lista platos con filtros opcionales. */
export async function fetchPlatos(opts: {
  clienteId?: string;
  categoriaId?: string;
  soloDisponibles?: boolean;
} = {}): Promise<Plato[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      let q = supabase.from('platos').select('*').order('created_at', { ascending: false });
      if (opts.clienteId)      q = q.eq('cliente_id', opts.clienteId);
      if (opts.categoriaId)    q = q.eq('categoria_id', opts.categoriaId);
      if (opts.soloDisponibles) q = q.eq('disponible', true);

      const { data, error } = await q;
      if (!error && data) {
        saveLocalPlatos(data as Plato[]);
        return data as Plato[];
      }
    } catch (err) {
      console.warn('[database] fetchPlatos fallback local:', err);
    }
  }

  let list = getLocalPlatos();
  if (opts.clienteId)      list = list.filter(p => p.cliente_id    === opts.clienteId);
  if (opts.categoriaId)    list = list.filter(p => p.categoria_id  === opts.categoriaId);
  if (opts.soloDisponibles) list = list.filter(p => p.disponible);
  return list;
}

/** Crea un plato. */
export async function addPlato(payload: PlatoInsert): Promise<Plato> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('platos')
        .insert([{ ...payload, disponible: payload.disponible ?? true, destacado: payload.destacado ?? false }])
        .select()
        .single();
      if (!error && data) {
        saveLocalPlatos([data as Plato, ...getLocalPlatos()]);
        return data as Plato;
      }
      console.error('[database] addPlato error:', error?.message);
    } catch (err) {
      console.error('[database] addPlato exception:', err);
    }
  }
  const local: Plato = {
    ...payload,
    id: `local-${Date.now()}`,
    descripcion: payload.descripcion ?? '',
    imagen_url: payload.imagen_url ?? null,
    disponible: payload.disponible ?? true,
    destacado:  payload.destacado  ?? false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveLocalPlatos([local, ...getLocalPlatos()]);
  return local;
}

/** Actualiza campos de un plato. */
export async function updatePlato(id: string, patch: PlatoUpdate): Promise<Plato | null> {
  const list = getLocalPlatos();
  const idx = list.findIndex(p => p.id === id);
  let updated: Plato | null = null;
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...patch, updated_at: new Date().toISOString() };
    updated = list[idx];
    saveLocalPlatos(list);
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('platos')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) return data as Plato;
      console.error('[database] updatePlato error:', error?.message);
    } catch (err) {
      console.error('[database] updatePlato exception:', err);
    }
  }
  return updated;
}

/** Alterna el campo `disponible` de un plato. */
export async function togglePlatoDisponible(id: string): Promise<Plato | null> {
  const list = getLocalPlatos();
  const target = list.find(p => p.id === id);
  if (!target) return null;
  return updatePlato(id, { disponible: !target.disponible });
}

/** Alterna el campo `destacado` de un plato. */
export async function togglePlatoDestacado(id: string): Promise<Plato | null> {
  const list = getLocalPlatos();
  const target = list.find(p => p.id === id);
  if (!target) return null;
  return updatePlato(id, { destacado: !target.destacado });
}

/** Elimina un plato. */
export async function deletePlato(id: string): Promise<boolean> {
  saveLocalPlatos(getLocalPlatos().filter(p => p.id !== id));

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from('platos').delete().eq('id', id);
      if (error) { console.error('[database] deletePlato error:', error.message); return false; }
    } catch (err) {
      console.error('[database] deletePlato exception:', err);
    }
  }
  return true;
}

// ════════════════════════════════════════════════════════════════
// RESTAURANTE (info para cabeceras públicas / dashboard)
// ════════════════════════════════════════════════════════════════

export interface RestaurantInfo {
  id: string | null;
  name: string;
  slug: string;
  slogan: string;
  logo: string;
}

/**
 * Devuelve la información del restaurante.
 * @param clienteIdOrSlug id (uuid) o slug del cliente; si se omite se usa el primero activo.
 */
export async function fetchRestaurant(clienteIdOrSlug?: string | null): Promise<RestaurantInfo> {
  const clientes = await fetchClientes();
  const active = clientes.filter(c => c.estado !== false);

  const match =
    (clienteIdOrSlug
      ? active.find(c => c.id === clienteIdOrSlug || c.slug === clienteIdOrSlug) ??
        clientes.find(c => c.id === clienteIdOrSlug || c.slug === clienteIdOrSlug)
      : undefined) ??
    active[0] ??
    clientes[0] ??
    null;

  return {
    id: match?.id ?? null,
    name: match?.nombre_restaurante ?? '',
    slug: match?.slug ?? '',
    slogan: '',
    logo: '🍽️',
  };
}
