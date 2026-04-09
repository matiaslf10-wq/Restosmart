'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  formatBusinessModeLabel,
  formatPlanLabel,
  normalizeBusinessMode,
  type BusinessMode,
  type PlanCode,
} from '@/lib/plans';

type Producto = {
  id: number;
  categoria: string | null;
  disponible: boolean | null;
};

type Stats = {
  total: number;
  disponibles: number;
  porCategoria: Record<string, number>;
};

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

type ModuleStatus = 'enabled' | 'blocked' | 'not_applicable';

type DashboardModule = {
  key: string;
  title: string;
  description: string;
  status: ModuleStatus;
  href?: string;
  action?: string;
  externalHref?: string;
};

export default function AdminHome() {
  const [stats, setStats] = useState<Stats>({
    total: 0,
    disponibles: 0,
    porCategoria: {},
  });

  const [sessionData, setSessionData] = useState<AdminSessionPayload | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;

    async function cargarDashboard() {
      try {
        setCargando(true);
        setError('');

        const [sessionRes, statsRes] = await Promise.all([
          fetch('/api/admin/session', {
            method: 'GET',
            cache: 'no-store',
          }),
          fetch('/api/stats', {
            method: 'GET',
            cache: 'no-store',
          }),
        ]);

        const sessionJson = await sessionRes.json().catch(() => null);
        const statsJson = await statsRes.json().catch(() => []);

        if (!activo) return;

        if (!sessionRes.ok) {
          throw new Error(
            sessionJson?.error || 'No se pudo cargar la sesión comercial.'
          );
        }

        if (!statsRes.ok || !Array.isArray(statsJson)) {
          throw new Error('No se pudieron cargar las estadísticas.');
        }

        const productos = statsJson as Producto[];
        const total = productos.length;
        const disponibles = productos.filter((p) => p.disponible).length;

        const porCategoria: Record<string, number> = {};

        for (const p of productos) {
          const cat = (p.categoria || 'Sin categoría').toString();
          porCategoria[cat] = (porCategoria[cat] || 0) + 1;
        }

        const categoriasOrdenadas = Object.entries(porCategoria).sort(
          (a, b) => b[1] - a[1]
        );

        setSessionData((sessionJson?.session as AdminSessionPayload | null) ?? null);
        setStats({
          total,
          disponibles,
          porCategoria: Object.fromEntries(categoriasOrdenadas),
        });
      } catch (err) {
        console.error(err);
        if (!activo) return;
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar el dashboard.'
        );
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    cargarDashboard();

    return () => {
      activo = false;
    };
  }, []);

  const plan = sessionData?.plan ?? 'esencial';
  const planLabel = formatPlanLabel(plan);
  const capabilities = sessionData?.capabilities ?? {};
  const addons = sessionData?.addons ?? {};
  const tenantLabel =
    sessionData?.restaurant?.slug || sessionData?.tenantId || 'default';

  const businessMode = normalizeBusinessMode(
    sessionData?.business_mode ?? sessionData?.restaurant?.business_mode
  );
  const businessModeLabel = formatBusinessModeLabel(businessMode);

  const waiterModeStatus =
    businessMode === 'takeaway'
      ? 'No aplica'
      : capabilities.waiter_mode
      ? 'Activo'
      : 'Bloqueado';

  const modulos = useMemo<DashboardModule[]>(() => {
    const modules: DashboardModule[] = [
      {
        key: 'menu',
        title: 'Menú / Productos',
        description:
          'Gestión de productos, categorías y disponibilidad del menú.',
        status: 'enabled',
        href: '/admin/productos',
        action: 'Abrir módulo',
      },
      {
        key: 'mostrador',
        title: 'Mostrador / Caja',
        description:
          businessMode === 'takeaway'
            ? 'Entrega final de pedidos take away y confirmación de retiro desde una sola pantalla.'
            : 'Punto operativo compacto para entrega final y cierre de cuenta del salón en el flujo Esencial.',
        status: 'enabled',
        href: '/mostrador',
        action: 'Abrir módulo',
      },
      {
        key: 'mesas',
        title: 'Mesas y QR',
        description:
          businessMode === 'restaurant'
            ? 'Alta de mesas del salón, generación de QR y material imprimible para cada mesa.'
            : 'No se usa en modo take away porque la operación no se organiza por mesas.',
        status: businessMode === 'restaurant' ? 'enabled' : 'not_applicable',
        href:
          businessMode === 'restaurant'
            ? '/admin/mesas'
            : '/admin/configuracion',
        action:
          businessMode === 'restaurant' ? 'Abrir módulo' : 'Ver configuración',
      },
      {
        key: 'mozo',
        title: 'Modo mozo',
        description:
          businessMode === 'restaurant'
            ? 'Vista de salón, control de mesas y gestión operativa asistida.'
            : 'No aplica en take away porque no hay operación de salón ni mozos por mesa.',
        status:
          businessMode === 'takeaway'
            ? 'not_applicable'
            : capabilities.waiter_mode
            ? 'enabled'
            : 'blocked',
        href:
          businessMode === 'takeaway'
            ? '/admin/configuracion'
            : '/mozo/mesas',
        action:
          businessMode === 'takeaway'
            ? 'Ver configuración'
            : capabilities.waiter_mode
            ? 'Abrir módulo'
            : 'Disponible desde Pro',
      },
      {
        key: 'analytics',
        title: 'Analytics',
        description:
          'KPIs, rendimiento del negocio y lectura ejecutiva de la operación.',
        status: capabilities.analytics ? 'enabled' : 'blocked',
        href: '/admin/analytics',
        action: capabilities.analytics
          ? 'Abrir módulo'
          : 'Disponible en Intelligence',
      },
      {
        key: 'delivery',
        title: 'WhatsApp Delivery',
        description:
          'Canal de delivery por WhatsApp con configuración y operación dedicada.',
        status: addons.whatsapp_delivery ? 'enabled' : 'blocked',
        href: '/admin/delivery',
        action: addons.whatsapp_delivery ? 'Abrir módulo' : 'Activar add-on',
        externalHref: addons.whatsapp_delivery
          ? undefined
          : 'mailto:contacto@restosmart.com?subject=Activar%20WhatsApp%20Delivery',
      },
    ];

    return modules;
  }, [
    addons.whatsapp_delivery,
    businessMode,
    capabilities.analytics,
    capabilities.waiter_mode,
  ]);

  const nextStepText =
    businessMode === 'restaurant'
      ? 'Andá a “Menú / Productos” para cargar comidas, bebidas, cafetería y postres. Todo lo que esté marcado como disponible se muestra en el menú de las mesas.'
      : 'Andá a “Menú / Productos” para cargar comidas, bebidas, cafetería y postres. Todo lo que esté marcado como disponible queda listo para el flujo del negocio en modo take away.';

  const getModuleCardClassName = (status: ModuleStatus) => {
    switch (status) {
      case 'enabled':
        return 'border-slate-200 bg-white';
      case 'not_applicable':
        return 'border-amber-200 bg-amber-50';
      case 'blocked':
      default:
        return 'border-blue-200 bg-blue-50';
    }
  };

  const getModuleBadgeClassName = (status: ModuleStatus) => {
    switch (status) {
      case 'enabled':
        return 'bg-emerald-100 text-emerald-800';
      case 'not_applicable':
        return 'bg-amber-100 text-amber-800';
      case 'blocked':
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getModuleStatusLabel = (status: ModuleStatus) => {
    switch (status) {
      case 'enabled':
        return 'Disponible';
      case 'not_applicable':
        return 'No aplica';
      case 'blocked':
      default:
        return 'Bloqueado';
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Panel admin</h1>
          <p className="mt-1 text-sm text-slate-600">
            Resumen operativo y comercial del negocio.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/inicio"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Volver a inicio
          </Link>

          <Link
            href="/cocina"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Abrir cocina
          </Link>

          <Link
            href="/mostrador"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            Abrir mostrador / caja
          </Link>

          {businessMode === 'restaurant' && capabilities.waiter_mode ? (
            <Link
              href="/mozo/mesas"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Abrir mozo
            </Link>
          ) : null}
        </div>
      </section>

      {cargando && (
        <p className="text-sm text-slate-500">Cargando estadísticas...</p>
      )}

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-5">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-slate-500">Plan actual</p>
          <p className="mt-1 text-2xl font-bold">{planLabel}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-slate-500">Tenant</p>
          <p className="mt-1 text-2xl font-bold">{tenantLabel}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-slate-500">Modo de negocio</p>
          <p className="mt-1 text-2xl font-bold">{businessModeLabel}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-slate-500">Modo mozo</p>
          <p className="mt-1 text-2xl font-bold">{waiterModeStatus}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-slate-500">WhatsApp Delivery</p>
          <p className="mt-1 text-2xl font-bold">
            {addons.whatsapp_delivery ? 'Activo' : 'No activo'}
          </p>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Accesos rápidos</h2>
        <p className="mt-1 text-sm text-slate-600">
          Atajos internos según la función y el modo de operación.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Link
            href="/admin/productos"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            Menú / Productos
          </Link>

          <Link
            href="/cocina"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            Cocina
          </Link>

          <Link
            href="/mostrador"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
          >
            Mostrador / Caja
          </Link>

          {businessMode === 'restaurant' ? (
            <Link
              href="/admin/mesas"
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Mesas y QR
            </Link>
          ) : (
            <Link
              href="/pedir"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              Abrir take away
            </Link>
          )}

          {businessMode === 'restaurant' && capabilities.waiter_mode ? (
            <Link
              href="/mozo/mesas"
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Modo mozo
            </Link>
          ) : (
            <Link
              href="/inicio"
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Ir a inicio
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-sm text-slate-500">Productos totales</h2>
          <p className="text-3xl font-bold mt-1">{stats.total}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-sm text-slate-500">Disponibles en menú</h2>
          <p className="text-3xl font-bold mt-1">{stats.disponibles}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-sm text-slate-500">Categorías</h2>
          <ul className="mt-2 text-sm space-y-1">
            {Object.keys(stats.porCategoria).length === 0 && (
              <li className="text-slate-500">Sin productos aún.</li>
            )}

            {Object.entries(stats.porCategoria).map(([cat, cant]) => (
              <li key={cat} className="flex justify-between gap-3">
                <span className="truncate">{cat}</span>
                <span className="font-semibold">{cant}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Módulos del sistema</h2>
            <p className="mt-1 text-sm text-slate-600">
              Disponibilidad según plan, modo de negocio y add-ons contratados.
            </p>
          </div>

          <Link
            href="/admin/configuracion"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ver configuración
          </Link>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modulos.map((modulo) => (
            <div
              key={modulo.key}
              className={`rounded-2xl border p-4 ${getModuleCardClassName(
                modulo.status
              )}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{modulo.title}</h3>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${getModuleBadgeClassName(
                    modulo.status
                  )}`}
                >
                  {getModuleStatusLabel(modulo.status)}
                </span>
              </div>

              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                {modulo.description}
              </p>

              <div className="mt-4">
                {modulo.status === 'enabled' && modulo.href ? (
                  <Link
                    href={modulo.href}
                    className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    {modulo.action}
                  </Link>
                ) : modulo.externalHref ? (
                  <a
                    href={modulo.externalHref}
                    className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-700 border border-blue-300 hover:bg-blue-100"
                  >
                    {modulo.action}
                  </a>
                ) : modulo.status === 'not_applicable' && modulo.href ? (
                  <Link
                    href={modulo.href}
                    className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-amber-700 border border-amber-300 hover:bg-amber-100"
                  >
                    {modulo.action}
                  </Link>
                ) : (
                  <Link
                    href="/#precios"
                    className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-700 border border-blue-300 hover:bg-blue-100"
                  >
                    {modulo.action}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-2">Siguiente paso</h2>
        <p className="text-sm text-slate-600">{nextStepText}</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/admin/productos"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Ir a productos
          </Link>

          <Link
            href="/mostrador"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
          >
            Abrir mostrador / caja
          </Link>

          {businessMode === 'restaurant' ? (
            <Link
              href="/admin/mesas"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Ver mesas y QR
            </Link>
          ) : (
            <Link
              href="/admin/configuracion"
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
            >
              Revisar modo de negocio
            </Link>
          )}

          {!capabilities.analytics ? (
            <Link
              href="/#precios"
              className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              Desbloquear analytics
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}