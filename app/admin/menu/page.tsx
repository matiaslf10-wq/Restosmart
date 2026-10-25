'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
export default function AdminMenuPage() {
  const [message, setMessage] = useState('Verificando acceso al menú…');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const scope = new URLSearchParams(window.location.search);
    setQuery(scope.toString());
    fetch(`/api/admin/menu?${scope}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { const body = await response.json(); setMessage(body.error); })
      .catch(error => { if (error.name !== 'AbortError') setMessage('No se pudo verificar el acceso.'); });
    return () => controller.abort();
  }, []);
  return <main className="p-8 space-y-4">
    <h1 className="text-2xl font-bold">Menú del negocio</h1>
    <p role="status">{message}</p>
    <p>Las lecturas, altas, ediciones y bajas del menú heredado están deshabilitadas hasta verificar su pertenencia a una sucursal.</p>
    <Link href={`/admin/productos${query ? `?${query}` : ''}`}>Gestionar productos y categorías</Link>
  </main>;
}
