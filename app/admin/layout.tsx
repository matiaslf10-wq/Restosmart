'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

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

  const navItems = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/configuracion', label: 'Configuración' },
    { href: '/admin/operaciones', label: 'Operaciones' },
    { href: '/admin/productos', label: 'Menú / Productos' },
    { href: '/admin/delivery', label: 'Delivery' },
    { href: '/admin/analytics', label: 'Analytics' },
  ];

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg">Restosmart · Admin</span>

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
            className="text-xs bg-red-500 hover:bg-red-600 px-3 py-1 rounded-md"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}