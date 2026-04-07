'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { formatPlanLabel, type PlanCode } from '@/lib/plans';

type AdminSessionPayload = {
  adminId: string;
  email: string;
  iat: number;
  exp: number;
  tenantId?: string;
  plan?: PlanCode;
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
  } | null;
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

        setSessionData((data?.session as AdminSessionPayload | null) ?? null);
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

  const navItems = useMemo(() => {
    const capabilities = sessionData?.capabilities ?? {};

    return [
      { href: '/admin', label: 'Dashboard', visible: true },
      { href: '/admin/configuracion', label: 'Configuración', visible: true },
      { href: '/admin/operaciones', label: 'Operaciones', visible: true },
      { href: '/admin/productos', label: 'Menú / Productos', visible: true },
      {
        href: '/mozo/mesas',
        label: 'Mozo',
        visible: !!capabilities.waiter_mode,
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
  }, [sessionData]);

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
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
              <span className="font-bold text-lg">Restosmart · Admin</span>

              {sessionData?.restaurant?.slug ? (
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-200">
                  Tenant: {sessionData.restaurant.slug}
                </span>
              ) : null}

              <span className="rounded-full bg-blue-600/20 border border-blue-400/30 px-2.5 py-1 text-xs text-blue-100">
                Plan {planLabel}
              </span>

              {sessionData?.addons?.whatsapp_delivery ? (
                <span className="rounded-full bg-violet-600/20 border border-violet-400/30 px-2.5 py-1 text-xs text-violet-100">
                  WhatsApp Delivery activo
                </span>
              ) : null}
            </div>

            <nav className="flex items-center gap-2 text-sm flex-wrap">
              {navItems.map((item) => (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`px-2 py-1 rounded-md transition ${
                    isActive(item.href) ? 'bg-slate-700' : 'hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </button>
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