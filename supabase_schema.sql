-- ============================================================
-- SCHEMA PARA CARTA RESTAURANTE (MICARTA) EN SUPABASE
-- Esquema multi-tenant: cada restaurante es una fila en `clientes`
-- y su dueño es un usuario de Supabase Auth vinculado por `user_id`.
-- ============================================================

-- 1. Tabla de Perfiles (rol por usuario de auth)
-- Se crea automáticamente por el trigger handle_new_user.
CREATE TABLE IF NOT EXISTS public.perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'cliente'
        CHECK (rol IN ('admin', 'cliente')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabla de Clientes (Restaurantes)
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_restaurante VARCHAR(150) NOT NULL,
    slug VARCHAR(150) UNIQUE NOT NULL,
    telefono VARCHAR(50),
    fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_pago DATE,
    estado BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabla de Categorías (por cliente)
CREATE TABLE IF NOT EXISTS public.categorias (
    id VARCHAR(50) PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    icono VARCHAR(20) NOT NULL,
    gradiente VARCHAR(100) NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabla de Platos
CREATE TABLE IF NOT EXISTS public.platos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id VARCHAR(50) REFERENCES public.categorias(id) ON DELETE SET NULL,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT DEFAULT '',
    precio NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    imagen_url TEXT,
    disponible BOOLEAN NOT NULL DEFAULT true,
    destacado BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Índices útiles
CREATE INDEX IF NOT EXISTS idx_clientes_user_id ON public.clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_categorias_cliente_id ON public.categorias(cliente_id);
CREATE INDEX IF NOT EXISTS idx_platos_cliente_id ON public.platos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_platos_categoria_id ON public.platos(categoria_id);

-- 6. Trigger: crear perfil automáticamente al crear un usuario de Auth
--    (antes guardaba 'admin.' con un punto final por error — corregido).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.perfiles (id, email, rol)
    VALUES (
        NEW.id,
        NEW.email,
        CASE
            WHEN lower(NEW.email) = 'admin@micarta.com' THEN 'admin'
            ELSE 'cliente'
        END
    )
    ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            rol   = EXCLUDED.rol;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Reparación: filas que el trigger anterior dejó con 'admin.'
UPDATE public.perfiles
SET rol = 'admin', updated_at = timezone('utc'::text, now())
WHERE rol = 'admin.';

-- 7. RLS (Row Level Security)
--    Las tablas se leen/escriben con la clave anónima; en producción
--    restringir las políticas a usuarios autenticados / owners.
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo a perfiles"    ON public.perfiles;
DROP POLICY IF EXISTS "Permitir todo a clientes"    ON public.clientes;
DROP POLICY IF EXISTS "Permitir todo a categorias"  ON public.categorias;
DROP POLICY IF EXISTS "Permitir todo a platos"      ON public.platos;

CREATE POLICY "Permitir todo a perfiles"   ON public.perfiles   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a clientes"   ON public.clientes   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a categorias" ON public.categorias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo a platos"     ON public.platos     FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- DATOS DEMO (opcional) — descomentar si es un proyecto nuevo.
-- ============================================================
-- INSERT INTO public.clientes (id, user_id, nombre_restaurante, slug, telefono, estado)
-- VALUES
-- ('00000000-0000-0000-0000-000000000001', NULL, 'Restaurante Juan', 'restaurante-juan', '+51 999 111 222', true),
-- ('00000000-0000-0000-0000-000000000002', NULL, 'Café María',        'cafe-maria',        '+51 999 333 444', true)
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO public.categorias (id, cliente_id, nombre, icono, gradiente, orden) VALUES
-- ('c1', '00000000-0000-0000-0000-000000000001', 'Hamburguesas', '🍔', 'from-orange-100 to-amber-200', 1),
-- ('c2', '00000000-0000-0000-0000-000000000001', 'Bebidas',      '🥤', 'from-blue-100 to-cyan-100',     2),
-- ('c3', '00000000-0000-0000-0000-000000000001', 'Postres',      '🍰', 'from-pink-100 to-purple-100',   3)
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO public.platos (categoria_id, cliente_id, nombre, descripcion, precio, disponible) VALUES
-- ('c1', '00000000-0000-0000-0000-000000000001', 'Clásica BBQ', 'Carne, queso cheddar, cebolla caramelizada', 18.90, true),
-- ('c1', '00000000-0000-0000-0000-000000000001', 'Doble Americana', 'Doble carne, doble queso, pepinillos', 24.50, true),
-- ('c2', '00000000-0000-0000-0000-000000000001', 'Limonada de hierbabuena', 'Limón, hierbabuena, azúcar, agua mineral', 8.50, true)
-- ON CONFLICT DO NOTHING;