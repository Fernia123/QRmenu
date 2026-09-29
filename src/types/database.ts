// ============================================================
// Tipos centralizados — alineados exactamente con las tablas
// de Supabase.  Importar desde aquí en toda la aplicación.
// ============================================================

// ── Roles ────────────────────────────────────────────────────────
export type Rol = 'admin' | 'cliente';

// ── Tabla: perfiles ──────────────────────────────────────────────
export interface Perfil {
  id: string;            // UUID — mismo id que auth.users
  email: string;
  rol: Rol;
  created_at: string;    // TIMESTAMPTZ → ISO string
}

// ── Tabla: clientes ──────────────────────────────────────────────
export interface Cliente {
  id: string;                   // UUID
  user_id?: string | null;      // UUID — FK a auth.users (opcional)
  nombre_restaurante: string;   // VARCHAR
  slug: string;                 // VARCHAR — URL amigable
  telefono?: string | null;     // VARCHAR
  fecha_inicio: string;         // DATE → 'YYYY-MM-DD'
  fecha_pago: string;           // DATE → 'YYYY-MM-DD'
  estado: boolean;              // BOOLEAN — true = activo
  created_at: string;           // TIMESTAMPTZ
  updated_at: string;           // TIMESTAMPTZ
}

// Payload para crear un cliente (sin id/timestamps — los genera la BD)
export interface ClienteInsert {
  user_id?: string | null;
  nombre_restaurante: string;
  slug: string;
  telefono?: string | null;
  fecha_inicio: string;
  fecha_pago: string;
  estado?: boolean;
}

// Payload para actualizar un cliente (todos los campos son opcionales)
export type ClienteUpdate = Partial<ClienteInsert>;

// ── Tabla: categorias ────────────────────────────────────────────
export interface Categoria {
  id: string;          // VARCHAR — PK custom (ej: 'c1', 'bebidas')
  cliente_id: string;  // UUID — FK a clientes.id
  nombre: string;      // VARCHAR
  icono: string;       // VARCHAR — emoji o nombre de icono
  gradiente: string;   // VARCHAR — clases Tailwind o valor CSS
  orden: number;       // INT — posición en el menú
  created_at: string;  // TIMESTAMPTZ
}

export interface CategoriaInsert {
  id: string;
  cliente_id: string;
  nombre: string;
  icono: string;
  gradiente: string;
  orden?: number;
}

export type CategoriaUpdate = Partial<Omit<CategoriaInsert, 'id' | 'cliente_id'>>;

// ── Tabla: platos ────────────────────────────────────────────────
export interface Plato {
  id: string;              // UUID
  categoria_id: string;   // VARCHAR — FK a categorias.id
  cliente_id: string;     // UUID — FK a clientes.id
  nombre: string;         // VARCHAR
  descripcion: string;    // TEXT
  precio: number;         // DECIMAL
  imagen_url?: string | null; // TEXT
  disponible: boolean;    // BOOLEAN
  destacado: boolean;     // BOOLEAN
  created_at: string;     // TIMESTAMPTZ
  updated_at: string;     // TIMESTAMPTZ
}

export interface PlatoInsert {
  categoria_id: string;
  cliente_id: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  imagen_url?: string | null;
  disponible?: boolean;
  destacado?: boolean;
}

export type PlatoUpdate = Partial<Omit<PlatoInsert, 'cliente_id'>>;

// ── Respuestas API genéricas ─────────────────────────────────────
export interface ApiOk<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  details?: string;
}

export type ApiResponse<T = unknown> = ApiOk<T> | ApiError;
