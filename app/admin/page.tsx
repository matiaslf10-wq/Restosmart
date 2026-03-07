'use client';

import { useEffect, useState } from 'react';

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

export default function AdminHome() {
  const [stats, setStats] = useState<Stats>({
    total: 0,
    disponibles: 0,
    porCategoria: {},
  });

  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargarStats = async () => {
      setCargando(true);

      const res = await fetch('/api/stats');
      const productos = (await res.json()) as Producto[];

      const total = productos.length;
      const disponibles = productos.filter((p) => p.disponible).length;

      const porCategoria: Record<string, number> = {};

      for (const p of productos) {
        const cat = (p.categoria || 'Sin categoría').toString();
        porCategoria[cat] = (porCategoria[cat] || 0) + 1;
      }

      setStats({ total, disponibles, porCategoria });
      setCargando(false);
    };

    cargarStats();
  }, []);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {cargando && <p className="text-sm text-slate-500">Cargando estadísticas...</p>}
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
              <li key={cat} className="flex justify-between">
                <span>{cat}</span>
                <span className="font-semibold">{cant}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-2">Siguiente paso</h2>
        <p className="text-sm text-slate-600">
          Andá a <span className="font-semibold">“Menú / Productos”</span> para cargar comidas,
          bebidas, cafetería y postres. Todo lo que esté marcado como{' '}
          <span className="font-semibold">disponible</span> se muestra en el menú de las mesas.
        </p>
      </section>
    </div>
  );
}