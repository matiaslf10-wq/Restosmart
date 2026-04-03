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

  useEffect(() => {
    if (pathname === '/admin/login') {
      setReady(true);
      return;
    }

    const sessionRaw =
      typeof window !== 'undefined'
        ? localStorage.getItem('admin_session')
        : null;

    if (!sessionRaw) {
      router.replace('/admin/login');
      return;
    }

    try {
      const parsed = JSON.parse(sessionRaw);
      if (!parsed.logged) {
        router.replace('/admin/login');
        return;
      }
      setReady(true);
    } catch {
      router.replace('/admin/login');
    }
  }, [pathname, router]);

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100">
        <p>Verificando acceso...</p>
      </main>
    );
  }

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const navItems = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/productos', label: 'Menú / Productos' },
    { href: '/admin/delivery', label: 'Delivery' },
    { href: '/admin/analytics', label: 'Analytics' },
  ];

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const logout = () => {
    localStorage.removeItem('admin_session');
    router.replace('/admin/login');
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