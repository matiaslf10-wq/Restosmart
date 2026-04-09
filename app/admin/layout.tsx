'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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

type NavItem = {
  href: string;
  label: string;
  visible: boolean;
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sessionData, setSessionData] = useState<AdminSessionPayload | null>(null);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      if (pathname === '/admin/login') {
        if (active) {
          setReady(true);
          setChecking(false);
        }
        return;
      }

      try {
        const res = await fetch('/api/admin/session', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!active) return;

        if (!res.ok) {
          router.replace('/admin/login');
          return;
        }

        const data = await res.json().catch(() => null);

        if (!active) return;

        const session = (data?.session as AdminSessionPayload | null) ?? null;
        const capabilities = session?.capabilities ?? {};

        const analyticsBlocked =
          pathname.startsWith('/admin/analytics') && !capabilities.analytics;

        const deliveryBlocked =
          pathname.startsWith('/admin/delivery') && !capabilities.delivery;

        if (analyticsBlocked || deliveryBlocked) {
          router.replace('/admin');
          return;
        }

        setSessionData(session);
        setReady(true);
      } catch (error) {
        console.error('No se pudo verificar la sesión admin', error);
        if (!active) return;
        router.replace('/admin/login');
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    }

    setReady(false);
    setChecking(true);
    setSessionData(null);
    verifySession();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  async function logout() {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
      });
    } catch (error) {
      console.error('No se pudo cerrar la sesión', error);
    } finally {
      router.replace('/admin/login');
      router.refresh();
    }
  }

  const businessMode = normalizeBusinessMode(
    sessionData?.business_mode ?? sessionData?.restaurant?.business_mode
  );
  const businessModeLabel = formatBusinessModeLabel(businessMode);

  const navItems = useMemo<NavItem[]>(() => {
    const capabilities = sessionData?.capabilities ?? {};

    return [
      { href: '/inicio', label: 'Inicio', visible: true },
      { href: '/admin', label: 'Dashboard', visible: true },
      { href: '/cocina', label: 'Cocina', visible: true },
      { href: '/mostrador', label: 'Mostrador / Caja', visible: true },
      {
        href: '/pedir',
        label: 'Take Away',
        visible: businessMode === 'takeaway',
      },
      { href: '/admin/configuracion', label: 'Configuración', visible: true },
      { href: '/admin/operaciones', label: 'Operaciones', visible: true },
      { href: '/admin/productos', label: 'Menú / Productos', visible: true },
      {
        href: '/admin/mesas',
        label: 'Mesas / QR',
        visible: businessMode === 'restaurant',
      },
      {
        href: '/mozo/mesas',
        label: 'Mozo',
        visible: businessMode === 'restaurant' && !!capabilities.waiter_mode,
      },
      {
        href: '/admin/delivery',
        label: 'Delivery',
        visible: !!capabilities.delivery,
      },
      {
        href: '/admin/analytics',
        label: 'Analytics',
        visible: !!capabilities.analytics,
      },
    ].filter((item) => item.visible);
  }, [businessMode, sessionData]);

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    if (href === '/inicio') return pathname === '/inicio';
    if (href === '/cocina') return pathname === '/cocina';
    if (href === '/mostrador') return pathname === '/mostrador';
    if (href === '/mozo/mesas') return pathname === '/mozo/mesas';
    if (href === '/pedir') return pathname === '/pedir';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100">
        <p>Verificando acceso...</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100">
        <p>Redirigiendo...</p>
      </main>
    );
  }

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const planLabel = formatPlanLabel(sessionData?.plan ?? 'esencial');

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-lg">RestoSmart · Admin</span>

              {sessionData?.restaurant?.slug ? (
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-200">
                  Tenant: {sessionData.restaurant.slug}
                </span>
              ) : null}

              <span className="rounded-full bg-blue-600/20 border border-blue-400/30 px-2.5 py-1 text-xs text-blue-100">
                Plan {planLabel}
              </span>

              <span
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  businessMode === 'restaurant'
                    ? 'bg-emerald-600/20 border-emerald-400/30 text-emerald-100'
                    : 'bg-amber-600/20 border-amber-400/30 text-amber-100'
                }`}
              >
                Modo {businessModeLabel}
              </span>

              {sessionData?.addons?.whatsapp_delivery ? (
                <span className="rounded-full bg-violet-600/20 border border-violet-400/30 px-2.5 py-1 text-xs text-violet-100">
                  WhatsApp Delivery activo
                </span>
              ) : null}
            </div>

            <nav className="flex items-center gap-2 text-sm flex-wrap">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2 py-1 rounded-md transition ${
                    isActive(item.href) ? 'bg-slate-700' : 'hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <button
            onClick={logout}
            className="self-start lg:self-auto text-xs bg-red-500 hover:bg-red-600 px-3 py-1 rounded-md"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}