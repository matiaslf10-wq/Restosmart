'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  formatBusinessModeLabel,
  formatPlanLabel,
  normalizeBusinessMode,
  type BusinessMode,
  type PlanCode,
} from '@/lib/plans';

type AdminSessionPayload = {
  adminId: string;
  email: string;
  iat: number;
  exp: number;
  tenantId?: string;
  plan?: PlanCode;
  business_mode?: BusinessMode;
  addons?: {
    whatsapp_delivery?: boolean;
  };
  capabilities?: {
    analytics?: boolean;
    delivery?: boolean;
    waiter_mode?: boolean;
  };
  restaurant?: {
    id: string;
    slug: string;
    plan: PlanCode;
    business_mode?: BusinessMode;
  } | null;
};

type RestaurantStatus = 'activo' | 'pausado' | 'cerrado';

type RestaurantItem = {
  id: string;
  slug: string;
  nombre_local: string;
  direccion: string;
  telefono: string;
  celular: string;
  email: string;
  horario_atencion: string;
  business_mode: BusinessMode;
  multi_brand?: boolean;
  estado: RestaurantStatus;
  cerrado_en?: string | null;
  cerrado_motivo?: string | null;
};

type CardTone =
  | 'default'
  | 'pro'
  | 'intelligence'
  | 'addon'
  | 'not_applicable';

type QuickLink = {
  href?: string;
  title: string;
  description: string;
  badge?: string;
  tone?: CardTone;
  disabled?: boolean;
};

function getCardClassName(tone: CardTone = 'default', disabled = false) {
  if (disabled) {
    return 'border-slate-200 bg-slate-100 opacity-75';
  }

  switch (tone) {
    case 'pro':
      return 'border-blue-200 bg-blue-50 hover:border-blue-300 hover:bg-blue-100';
    case 'intelligence':
      return 'border-violet-200 bg-violet-50 hover:border-violet-300 hover:bg-violet-100';
    case 'addon':
      return 'border-emerald-200 bg-emerald-50 hover:border-emerald-300 hover:bg-emerald-100';
    case 'not_applicable':
      return 'border-amber-200 bg-amber-50';
    case 'default':
    default:
      return 'border-slate-200 bg-white hover:border-slate-300 hover:shadow';
  }
}

function getBadgeClassName(tone: CardTone = 'default') {
  switch (tone) {
    case 'pro':
      return 'bg-blue-100 text-blue-800';
    case 'intelligence':
      return 'bg-violet-100 text-violet-800';
    case 'addon':
      return 'bg-emerald-100 text-emerald-800';
    case 'not_applicable':
      return 'bg-amber-100 text-amber-800';
    case 'default':
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function getRestaurantName(restaurant: RestaurantItem) {
  return (
    restaurant.nombre_local?.trim() ||
    restaurant.slug?.trim() ||
    `Sucursal ${restaurant.id}`
  );
}

function getScopedHref(path: string, restaurantId: string) {
  return `${path}?restaurantId=${encodeURIComponent(restaurantId)}`;
}

function QuickAccessCard({
  href,
  title,
  description,
  badge,
  tone = 'default',
  disabled = false,
}: QuickLink) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-base font-semibold text-slate-900">{title}</div>

        {badge ? (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${getBadgeClassName(
              tone
            )}`}
          >
            {badge}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {description}
      </p>
    </>
  );

  const className = `rounded-2xl border p-5 shadow-sm transition ${
    disabled ? 'cursor-not-allowed' : 'hover:-translate-y-0.5'
  } ${getCardClassName(tone, disabled)}`;

  if (disabled || !href) {
    return <div className={className}>{content}</div>;
  }

  if (href.startsWith('mailto:')) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function RestaurantAccessCard({
  restaurant,
  mesaId,
  planAllowsMozo,
  hasOperationalManagement,
}: {
  restaurant: RestaurantItem;
  mesaId: number;
  planAllowsMozo: boolean;
  hasOperationalManagement: boolean;
}) {
  const businessMode = normalizeBusinessMode(restaurant.business_mode);
  const isRestaurant = businessMode === 'restaurant';
  const isTakeAway = businessMode === 'takeaway';
  const restaurantName = getRestaurantName(restaurant);

  const mostradorHref = getScopedHref('/mostrador', restaurant.id);
  const cocinaHref = getScopedHref('/cocina', restaurant.id);
  const operacionesHref = getScopedHref('/admin/operaciones', restaurant.id);
  const configuracionHref = getScopedHref('/admin/configuracion', restaurant.id);
  const mesasHref = getScopedHref('/admin/mesas', restaurant.id);
  const mozoHref = getScopedHref('/mozo/mesas', restaurant.id);
  const pedirHref = getScopedHref('/pedir', restaurant.id);
  const retiroHref = getScopedHref('/retiro', restaurant.id);
  const mesaClienteHref = `/mesa/${mesaId}?restaurantId=${encodeURIComponent(
    restaurant.id
  )}`;

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isRestaurant
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {formatBusinessModeLabel(businessMode)}
            </span>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              ID sucursal: {restaurant.id}
            </span>
          </div>

          <h2 className="mt-4 text-2xl font-bold text-slate-900">
            {restaurantName}
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {restaurant.direccion?.trim()
              ? restaurant.direccion
              : isRestaurant
              ? 'Sucursal configurada para operación con mesas.'
              : 'Sucursal configurada para operación take away.'}
          </p>
        </div>

        <Link
          href={configuracionHref}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Configurar
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Link
          href={mostradorHref}
          className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900 hover:bg-amber-100"
        >
          🧾 Abrir mostrador
          <span className="mt-1 block text-xs font-normal text-amber-800">
            Caja, cobro, cierre y operación diaria de esta sucursal.
          </span>
        </Link>

        <Link
          href={cocinaHref}
          className="rounded-2xl border border-sky-300 bg-sky-50 px-4 py-4 text-sm font-semibold text-sky-900 hover:bg-sky-100"
        >
          👨‍🍳 Abrir cocina
          <span className="mt-1 block text-xs font-normal text-sky-800">
            Preparación de pedidos de esta sucursal.
          </span>
        </Link>

        {hasOperationalManagement ? (
          <Link
            href={operacionesHref}
            className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            📍 Operaciones
            <span className="mt-1 block text-xs font-normal text-slate-700">
              Tablero operativo filtrado por sucursal.
            </span>
          </Link>
        ) : (
          <Link
            href="/#precios"
            className="rounded-2xl border border-blue-300 bg-blue-50 px-4 py-4 text-sm font-semibold text-blue-900 hover:bg-blue-100"
          >
            📍 Operaciones
            <span className="mt-1 block text-xs font-normal text-blue-800">
              Disponible desde Pro.
            </span>
          </Link>
        )}

        {isRestaurant ? (
          <>
            <Link
              href={mesasHref}
              className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              🔗 Mesas y QR
              <span className="mt-1 block text-xs font-normal text-emerald-800">
                Alta de mesas y QR propios de esta sucursal.
              </span>
            </Link>

            <Link
              href={mesaClienteHref}
              className="rounded-2xl border border-emerald-300 bg-white px-4 py-4 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
            >
              🪑 Probar mesa {mesaId}
              <span className="mt-1 block text-xs font-normal text-emerald-800">
                Entrada pública de cliente para esta sucursal.
              </span>
            </Link>

            {planAllowsMozo ? (
              <Link
                href={mozoHref}
                className="rounded-2xl border border-blue-300 bg-blue-50 px-4 py-4 text-sm font-semibold text-blue-900 hover:bg-blue-100"
              >
                🍽️ Abrir mozo
                <span className="mt-1 block text-xs font-normal text-blue-800">
                  Salón y mesas de esta sucursal.
                </span>
              </Link>
            ) : (
              <Link
                href="/#precios"
                className="rounded-2xl border border-blue-300 bg-blue-50 px-4 py-4 text-sm font-semibold text-blue-900 hover:bg-blue-100"
              >
                🍽️ Mozo
                <span className="mt-1 block text-xs font-normal text-blue-800">
                  Disponible desde Pro.
                </span>
              </Link>
            )}
          </>
        ) : null}

        {isTakeAway ? (
          <>
            <Link
              href={pedirHref}
              className="rounded-2xl border border-amber-300 bg-white px-4 py-4 text-sm font-semibold text-amber-900 hover:bg-amber-50"
            >
              🥡 Pedido público
              <span className="mt-1 block text-xs font-normal text-amber-800">
                Entrada take away para esta sucursal.
              </span>
            </Link>

            <Link
              href={retiroHref}
              className="rounded-2xl border border-amber-300 bg-white px-4 py-4 text-sm font-semibold text-amber-900 hover:bg-amber-50"
            >
              📺 Pantalla de retiro
              <span className="mt-1 block text-xs font-normal text-amber-800">
                Pedidos listos y en preparación de esta sucursal.
              </span>
            </Link>
          </>
        ) : null}
      </div>
    </article>
  );
}

export default function InicioPage() {
  const router = useRouter();

  const [mesaInput, setMesaInput] = useState('1');
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [sessionData, setSessionData] =
    useState<AdminSessionPayload | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantItem[]>([]);
  const [error, setError] = useState('');
  const [restaurantsError, setRestaurantsError] = useState('');

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        setCheckingAccess(true);
        setError('');
        setRestaurantsError('');

        const [sessionRes, restaurantsRes] = await Promise.all([
          fetch('/api/admin/session', {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include',
          }),
          fetch('/api/admin/restaurants', {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include',
          }),
        ]);

        const sessionPayload = await sessionRes.json().catch(() => null);

        if (!sessionRes.ok) {
          router.replace('/admin/login');
          return;
        }

        const restaurantsPayload = await restaurantsRes.json().catch(() => null);

        if (!active) return;

        setSessionData(
          (sessionPayload?.session as AdminSessionPayload | null) ?? null
        );

        if (!restaurantsRes.ok) {
          setRestaurants([]);
          setRestaurantsError(
            restaurantsPayload?.error ||
              'No se pudieron cargar las sucursales del tenant.'
          );
        } else {
          setRestaurants((restaurantsPayload?.items ?? []) as RestaurantItem[]);
        }
      } catch (err) {
        console.error('No se pudo cargar inicio', err);

        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar la sesión.'
        );
      } finally {
        if (active) {
          setCheckingAccess(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [router]);

  const mesaId = useMemo(() => {
    const parsed = Number.parseInt(mesaInput, 10);
    if (Number.isNaN(parsed) || parsed < 1) return 1;
    return parsed;
  }, [mesaInput]);

  const plan = sessionData?.plan ?? sessionData?.restaurant?.plan ?? 'esencial';
  const planLabel = formatPlanLabel(plan);

  const sessionBusinessMode = normalizeBusinessMode(
    sessionData?.business_mode ?? sessionData?.restaurant?.business_mode
  );

  const businessModeLabel = formatBusinessModeLabel(sessionBusinessMode);
  const tenantLabel =
    sessionData?.restaurant?.slug || sessionData?.tenantId || 'default';

  const capabilities = sessionData?.capabilities ?? {};
  const addons = sessionData?.addons ?? {};

  const hasOperationalManagement =
    plan === 'pro' || plan === 'intelligence';

  const planAllowsMozo = plan === 'pro' || plan === 'intelligence';
  const canUseAnalytics = capabilities.analytics === true;
  const hasWhatsappDelivery = addons.whatsapp_delivery === true;

  const activeRestaurants = useMemo(
    () => restaurants.filter((restaurant) => restaurant.estado === 'activo'),
    [restaurants]
  );

  const planSummary = useMemo(() => {
    if (plan === 'intelligence') {
      return {
        title: 'Intelligence activo',
        description:
          'Tenés operación completa, gestión ampliada y analytics avanzados para leer rendimiento, marcas, canales y tiempos.',
        badgeTone: 'intelligence' as CardTone,
      };
    }

    if (plan === 'pro') {
      return {
        title: 'Pro activo',
        description:
          'Tenés gestión operativa ampliada. Cada sucursal puede abrir su propio mostrador, cocina y mozo si trabaja con mesas.',
        badgeTone: 'pro' as CardTone,
      };
    }

    return {
      title: 'Esencial activo',
      description:
        'Tenés la base operativa. En este inicio elegís la sucursal y desde ahí abrís sus pantallas de trabajo.',
      badgeTone: 'default' as CardTone,
    };
  }, [plan]);

  const quickLinks = useMemo<QuickLink[]>(() => {
    const links: QuickLink[] = [
      {
        href: '/admin',
        title: '🛠️ Administración',
        description:
          'Panel principal para gestionar el negocio, revisar módulos, productos, configuración y estado general.',
        badge: 'Base',
      },
      {
        href: '/admin/restaurantes',
        title: '🏪 Sucursales',
        description:
          'Alta, edición y cierre de sucursales del tenant. Desde ahí se organiza la operación multi-sucursal.',
        badge: 'Multi-tenant',
      },
      {
        href: '/admin/productos',
        title: '🍔 Menú / Productos',
        description:
          'Carga y administración de productos, categorías, precios, imágenes, disponibilidad, marcas y visibilidad por sucursal.',
        badge: 'Base',
      },
      {
        href: '/admin/configuracion',
        title: '⚙️ Configuración',
        description:
          'Configuración general del local, modo de negocio y datos operativos.',
        badge: 'Base',
      },
      {
        href: hasOperationalManagement ? '/admin/operaciones' : '/#precios',
        title: '📍 Gestión operativa',
        description: hasOperationalManagement
          ? 'Tablero transversal para seguir la operación diaria con más control.'
          : 'Tablero ampliado para coordinar mejor cocina, mostrador, salón y entrega. Disponible desde Pro.',
        badge: hasOperationalManagement ? 'Activo' : 'Pro',
        tone: hasOperationalManagement ? 'default' : 'pro',
      },
    ];

    links.push({
      href: canUseAnalytics ? '/admin/analytics' : '/#precios',
      title: '📊 Analytics',
      description: canUseAnalytics
        ? 'KPIs, lectura ejecutiva, marcas, canales, productos, tendencias y exportaciones.'
        : 'KPIs avanzados, lectura ejecutiva y reportes. Disponible en Intelligence.',
      badge: canUseAnalytics ? 'Activo' : 'Intelligence',
      tone: canUseAnalytics ? 'default' : 'intelligence',
    });

    links.push({
      href: hasWhatsappDelivery
        ? '/admin/delivery'
        : 'mailto:contacto@restosmart.com?subject=Activar%20WhatsApp%20Delivery',
      title: '💬 WhatsApp Delivery',
      description: hasWhatsappDelivery
        ? 'Configuración y operación del canal de delivery por WhatsApp.'
        : 'Add-on opcional por restaurante. No forma parte estándar de ningún plan.',
      badge: hasWhatsappDelivery ? 'Activo' : 'Add-on',
      tone: 'addon',
    });

    return links;
  }, [
    canUseAnalytics,
    hasOperationalManagement,
    hasWhatsappDelivery,
  ]);

  if (checkingAccess) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-slate-600">Cargando inicio…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {restaurantsError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {restaurantsError}
          </div>
        ) : null}

        <header className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                RestoSmart
              </p>

              <h1 className="mt-2 text-4xl font-bold text-slate-900">
                Inicio
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
                Esta pantalla funciona como antesala después del login. Primero
                elegís la sucursal y después abrís su mostrador, cocina, mozo o
                pantalla pública correspondiente.
              </p>
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClassName(
                  planSummary.badgeTone
                )}`}
              >
                {planSummary.title}
              </span>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Plan {planLabel}
              </span>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {businessModeLabel} · {tenantLabel}
              </span>
            </div>
          </div>

          <p className="mt-5 max-w-4xl text-sm leading-relaxed text-slate-600">
            {planSummary.description}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Ir al panel admin
            </Link>

            <Link
              href="/admin/restaurantes"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Gestionar sucursales
            </Link>

            <Link
              href="/admin/productos"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Menú / productos
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                Elegí sucursal para operar
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                Desde acá se define a qué sucursal pertenece cada pantalla. Así
                evitamos abrir un mostrador, cocina o mozo genérico sin contexto.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="block text-sm font-semibold text-slate-900">
                Mesa de prueba
              </label>

              <input
                type="number"
                min={1}
                value={mesaInput}
                onChange={(e) => setMesaInput(e.target.value)}
                className="mt-2 h-11 w-36 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500"
              />

              <p className="mt-2 text-xs text-slate-500">
                Se usa para probar <code>/mesa/{mesaId}</code> por sucursal.
              </p>
            </div>
          </div>

          {activeRestaurants.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-800">
                No hay sucursales activas para operar.
              </p>

              <p className="mt-2 text-sm text-slate-600">
                Creá o reactivá una sucursal desde administración para poder
                abrir Mostrador, Cocina o Mozo con contexto.
              </p>

              <Link
                href="/admin/restaurantes"
                className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Ir a sucursales
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-5">
              {activeRestaurants.map((restaurant) => (
                <RestaurantAccessCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  mesaId={mesaId}
                  planAllowsMozo={planAllowsMozo}
                  hasOperationalManagement={hasOperationalManagement}
                />
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((link) => (
            <QuickAccessCard
              key={`${link.title}-${link.badge ?? ''}`}
              {...link}
            />
          ))}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Flujo esperado del sistema
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {[
              {
                step: '1',
                title: 'Login',
                desc: 'Ingreso del usuario con credenciales.',
              },
              {
                step: '2',
                title: 'Inicio',
                desc: 'Selección de sucursal activa.',
              },
              {
                step: '3',
                title: 'Pantalla operativa',
                desc: 'Mostrador, cocina, mozo, retiro o pedido público reciben restaurantId.',
              },
              {
                step: '4',
                title: 'Operación separada',
                desc: 'Pedidos, mesas, stock y productos se filtran por sucursal.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-slate-900 text-sm font-bold text-white">
                  {item.step}
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">
                  {item.title}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}