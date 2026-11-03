'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Branch = { id: string | number; nombre_local?: string; slug?: string; estado?: string };
export default function BranchPicker({ destination, title }: { destination: string; title: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/admin/restaurants', { cache: 'no-store', credentials: 'include' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'No se pudieron cargar las sucursales.');
        if (active) setBranches((body.items || []).filter((branch: Branch) => branch.estado !== 'cerrado'));
      })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : 'No se pudieron cargar las sucursales.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return (
    <section className="mx-auto w-full max-w-5xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <h1 className="text-xl font-semibold">Elegí una sucursal para abrir {title}</h1>
      <p className="mt-2">Seleccioná la sucursal con la que querés trabajar.</p>
      {loading ? <p className="mt-4" role="status">Cargando sucursales…</p> : null}
      {error ? <p className="mt-4" role="alert">{error}</p> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {branches.map(branch => <Link key={branch.id} href={`${destination}?restaurantId=${encodeURIComponent(String(branch.id))}`} className="min-w-0 rounded-xl border border-amber-300 bg-white px-4 py-3 font-semibold hover:bg-amber-100">
          {branch.nombre_local || branch.slug || `Sucursal ${branch.id}`}
          <span className="mt-1 block text-xs font-normal">Abrir {title} de esta sucursal</span>
        </Link>)}
      </div>
      {!loading && !error && !branches.length ? <p>No hay sucursales activas disponibles.</p> : null}
      <Link href="/inicio" className="mt-4 inline-block underline">Volver a Inicio</Link>
    </section>
  );
}
