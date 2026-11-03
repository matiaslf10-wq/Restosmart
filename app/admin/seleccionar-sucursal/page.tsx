'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import BranchPicker from '@/components/BranchPicker';
const destinations = {
  cocina: ['/cocina', 'Cocina'],
  mostrador: ['/mostrador', 'Mostrador / Caja'],
  mozo: ['/mozo/mesas', 'Mozo'],
  retiro: ['/retiro', 'Preparación / Listos'],
} as const;
function Selection() {
  const params = useSearchParams();
  const key = params.get('destino') || 'cocina';
  const [destination, title] = destinations[key as keyof typeof destinations] || destinations.cocina;
  return <main className="min-h-screen bg-slate-100 p-6"><BranchPicker destination={destination} title={title} /></main>;
}
export default function Page() {
  return <Suspense fallback={<p>Cargando sucursales…</p>}><Selection /></Suspense>;
}
