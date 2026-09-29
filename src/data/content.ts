// Static site copy — single source of truth for the landing page.

export const features = [
  {
    icon: 'bolt',
    title: 'Actualizaciones en tiempo real',
    text: 'Cambia precios y disponibilidad al instante. Tus clientes siempre ven la información actualizada.',
  },
  {
    icon: 'qr',
    title: 'Código QR incluido',
    text: 'Genera automáticamente tu código QR para que tus clientes accedan a tu carta con solo escanear.',
  },
  {
    icon: 'palette',
    title: 'Diseños personalizables',
    text: 'Elige entre plantillas y colores para que la carta coincida con la identidad de tu marca.',
  },
  {
    icon: 'chart',
    title: 'Estadísticas de visitas',
    text: 'Conoce qué platos son los más vistos y toma decisiones basadas en datos reales.',
  },
  {
    icon: 'folder',
    title: 'Categorías ilimitadas',
    text: 'Organiza tu menú por categorías de forma clara, rápida y profesional.',
  },
  {
    icon: 'globe',
    title: 'Sin descargas',
    text: 'Funciona en cualquier navegador. Tus clientes no instalan ninguna app.',
  },
] as const;

export const steps = [
  
  {
    title: 'Carga tu carta',
    text: 'Agrega categorías y platos con foto, descripción y precio.',
  },
  {
    title: 'Comparte tu QR',
    text: 'Imprime tu código QR y recibe pedidos. Actualiza cuando quieras.',
  },
] as const;

export const plans = [

  {
    name: 'Pro',
    price: 49,
    period: 'por mes',
    highlight: true,
    cta: 'Probar Pro',
    features: [
      'Todo lo del plan Básico',
      'Platos y categorías ilimitados',
      'Plantillas premium',
      'Estadísticas de visitas',
      'Soporte prioritario',
    ],
  },
  {
    name: 'Restaurante',
    price: 89,
    period: 'por mes',
    highlight: false,
    cta: 'Hablar con ventas',
    features: [
      'Todo lo del plan Pro',
      'Multi-sucursal',
      'Varias cartas por local',
      'Roles de equipo',
      'Soporte 24/7',
    ],
  },
] as const;
