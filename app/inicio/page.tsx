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

type CardTone = 'default' | 'pro' | 'intelligence' | 'addon' | 'not_applicable';

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

export default function InicioPage() {
  const router = useRouter();

  const [mesaInput, setMesaInput] = useState('1');
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [sessionData, setSessionData] =
    useState<AdminSessionPayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        setCheckingAccess(true);
        setError('');

        const res = await fetch('/api/admin/session', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
        });

        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          router.replace('/admin/login');
          return;
        }

        if (!active) return;

        setSessionData(
          (payload?.session as AdminSessionPayload | null) ?? null
        );
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

  const businessMode = normalizeBusinessMode(
    sessionData?.business_mode ?? sessionData?.restaurant?.business_mode
  );

  const businessModeLabel = formatBusinessModeLabel(businessMode);
  const tenantLabel =
    sessionData?.restaurant?.slug || sessionData?.tenantId || 'default';

  const capabilities = sessionData?.capabilities ?? {};
  const addons = sessionData?.addons ?? {};

  const isRestaurant = businessMode === 'restaurant';
  const isTakeAway = businessMode === 'takeaway';

  const hasOperationalManagement =
    plan === 'pro' || plan === 'intelligence';

  const canUseMozo = isRestaurant && capabilities.waiter_mode === true;
  const canUseAnalytics = capabilities.analytics === true;
  const hasWhatsappDelivery = addons.whatsapp_delivery === true;

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
          isRestaurant
            ? 'Tenés gestión operativa ampliada y modo mozo para ordenar mejor el salón.'
            : 'Tenés gestión operativa ampliada para ordenar mejor mostrador, cocina y retiro.',
        badgeTone: 'pro' as CardTone,
      };
    }

    return {
      title: 'Esencial activo',
      description:
        isRestaurant
          ? 'Tenés la base operativa: menú, cocina, mostrador, mesas y QR. Pro suma gestión operativa ampliada y modo mozo.'
          : 'Tenés la base operativa para take away: menú, cocina, mostrador, pedido público y retiro.',
      badgeTone: 'default' as CardTone,
    };
  }, [isRestaurant, plan]);

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
        href: '/admin/productos',
        title: '🍔 Menú / Productos',
        description:
          'Carga y administración de productos, categorías, precios, imágenes, disponibilidad y marcas.',
        badge: 'Base',
      },
      {
        href: '/cocina',
        title: '👨‍🍳 Cocina',
        description:
          'Vista operativa para preparar pedidos y actualizar estados de cocina.',
        badge: 'Base',
      },
      {
        href: '/mostrador',
        title: '🧾 Mostrador / Caja',
        description:
          isTakeAway
            ? 'Pantalla central para tomar pedidos, cobrar, entregar y cerrar retiros.'
            : 'Pantalla central para cobro, cierre de cuenta, apoyo al salón y operación diaria.',
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

    if (isRestaurant) {
      links.push({
        href: '/admin/mesas',
        title: '🔗 Mesas y QR',
        description:
          'Alta de mesas, generación de QR y accesos públicos por mesa para clientes del salón.',
        badge: 'Restaurante',
      });

      links.push({
        href: canUseMozo ? '/mozo/mesas' : '/#precios',
        title: '🍽️ Mozo',
        description: canUseMozo
          ? 'Vista de salón para atención de mesas, seguimiento de pedidos y operación del mozo.'
          : 'Vista de salón para atención de mesas. Disponible desde Pro en modo restaurante.',
        badge: canUseMozo ? 'Activo' : 'Pro',
        tone: canUseMozo ? 'default' : 'pro',
      });
    } else {
      links.push({
        href: '/pedir',
        title: '🥡 Pedido Take Away',
        description:
          'Entrada pública para que el cliente haga un pedido sin mesa y retire por mostrador.',
        badge: 'Take Away',
      });

      links.push({
        href: '/retiro',
        title: '📺 Pantalla de retiro',
        description:
          'Pantalla pública para mostrar pedidos en preparación y pedidos listos para retirar.',
        badge: 'Take Away',
      });

      links.push({
        title: '🍽️ Mozo',
        description:
          'No aplica en modo take away porque no hay atención de salón por mesa.',
        badge: 'No aplica',
        tone: 'not_applicable',
        disabled: true,
      });
    }

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
    canUseMozo,
    hasOperationalManagement,
    hasWhatsappDelivery,
    isRestaurant,
    isTakeAway,
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
                Esta pantalla funciona como antesala después del login. Desde
                acá elegís a qué vista entrar según la función dentro del local.
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
              href="/cocina"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Abrir cocina
            </Link>

            <Link
              href="/mostrador"
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              Abrir mostrador / caja
            </Link>

            {canUseMozo ? (
              <Link
                href="/mozo/mesas"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Abrir mozo
              </Link>
            ) : null}

            {isTakeAway ? (
              <Link
                href="/pedir"
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
              >
                Abrir take away
              </Link>
            ) : null}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((link) => (
            <QuickAccessCard
              key={`${link.title}-${link.badge ?? ''}`}
              {...link}
            />
          ))}
        </section>

        {isRestaurant ? (
          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  Restaurante
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Con mesas
                </span>
              </div>

              <h2 className="mt-4 text-2xl font-bold text-slate-900">
                Acceso del cliente por mesa
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Para el flujo de salón, el cliente entra por una mesa específica.
                Podés abrir una mesa manualmente desde acá para probar o validar
                el recorrido.
              </p>

              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <label className="block text-sm font-semibold text-emerald-900">
                  ID de mesa
                </label>

                <input
                  type="number"
                  min={1}
                  value={mesaInput}
                  onChange={(e) => setMesaInput(e.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-emerald-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-500"
                />

                <p className="mt-2 text-xs text-emerald-900/80">
                  Esto abre la ruta <code>/mesa/{mesaId}</code>.
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href={`/mesa/${mesaId}`}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Abrir mesa {mesaId}
                </Link>

                <Link
                  href="/admin/mesas"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Revisar mesas y QR
                </Link>

                <Link
                  href="/mostrador"
                  className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Abrir caja / salón
                </Link>
              </div>
            </article>

            <article className="rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
              <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
                Pro
              </span>

              <h2 className="mt-4 text-2xl font-bold text-slate-900">
                Operación de salón
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                En modo restaurante, Pro habilita el modo mozo para trabajar con
                mesas, seguimiento de pedidos y coordinación del salón.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                {canUseMozo ? (
                  <Link
                    href="/mozo/mesas"
                    className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Abrir modo mozo
                  </Link>
                ) : (
                  <Link
                    href="/#precios"
                    className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800"
                  >
                    Ver Pro
                  </Link>
                )}

                <Link
                  href="/admin/configuracion"
                  className="rounded-xl border border-blue-300 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                >
                  Ver configuración
                </Link>
              </div>
            </article>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  Take Away
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Sin mesas
                </span>
              </div>

              <h2 className="mt-4 text-2xl font-bold text-slate-900">
                Acceso público para pedidos
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                En take away el cliente no necesita mesa. El ingreso público se
                resuelve desde <code>/pedir</code>, la pantalla de retiro desde{' '}
                <code>/retiro</code> y la entrega final desde{' '}
                <code>/mostrador</code>.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href="/pedir"
                  className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-600"
                >
                  Abrir take away
                </Link>

                <Link
                  href="/retiro"
                  className="rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Abrir pantalla de retiro
                </Link>

                <Link
                  href="/mostrador"
                  className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Abrir mostrador / caja
                </Link>
              </div>
            </article>

            <article className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                QR Take Away
              </span>

              <h2 className="mt-4 text-2xl font-bold text-slate-900">
                QR del local
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                En modo take away no se generan QR por mesa. El QR principal
                debería apuntar a la entrada pública <code>/pedir</code>.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/admin/configuracion"
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Ver configuración
                </Link>

                <Link
                  href="/pedir"
                  className="rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Probar pedido público
                </Link>
              </div>
            </article>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Flujo esperado del sistema
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {[
              {
                step: '1',
                title: 'Página principal',
                desc: 'Entrada pública comercial del producto.',
              },
              {
                step: '2',
                title: 'Login',
                desc: 'Ingreso del usuario con credenciales.',
              },
              {
                step: '3',
                title: 'Inicio',
                desc: 'Selección de vista según función y permisos.',
              },
              {
                step: '4',
                title: 'Operación',
                desc: isRestaurant
                  ? 'Admin, cocina, mostrador, mesas, QR y mozo si el plan lo permite.'
                  : 'Admin, cocina, mostrador, pedido público y pantalla de retiro.',
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