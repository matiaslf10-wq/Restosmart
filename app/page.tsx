import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
      <h1 className="text-3xl font-bold">RestoSmart</h1>
      <ul className="space-y-2 text-center">
        <li>
          <Link href="/mesa/1" className="text-emerald-700 underline">
            🍽️ Mesa 1 (cliente)
          </Link>
        </li>
        <li>
          <Link href="/cocina" className="text-emerald-700 underline">
            👨‍🍳 Vista de cocina
          </Link>
        </li>
        <li>
          <Link href="/mozo/mesas" className="text-emerald-700 underline">
            🧾 Vista de mozo (todas las mesas)
          </Link>
        </li>
        <li>
          <Link href="/admin/productos" className="text-emerald-700 underline">
            🛠️ Admin productos
          </Link>
        </li>
        <li>
          <Link href="/admin/mesas" className="text-emerald-700 underline">
            🔗 QR por mesa
          </Link>
        </li>
      </ul>
    </main>
  );
}
