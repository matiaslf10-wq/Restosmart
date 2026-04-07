import { Suspense } from 'react';
import DemoClient from './DemoClient';

export const dynamic = 'force-dynamic';

export default function DemoPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-zinc-600">
          Cargando demo interactiva...
        </div>
      }
    >
      <DemoClient />
    </Suspense>
  );
}