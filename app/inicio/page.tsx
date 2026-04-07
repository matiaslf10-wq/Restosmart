import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
            Restosmart
          </p>
          <h1 className="mt-2 text-4xl font-bold text-slate-900">
            Entorno de prueba
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
            Acá podés entrar a los flujos principales del sistema. Desde este punto,
            dejamos explícito que el acceso <code>/mesa/[id]</code> corresponde al
            modo restaurante con mesas, y que take away va a necesitar una ruta
            pública separada.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                Restaurante
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Con mesas
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-bold text-slate-900">
              Flujo de salón
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Este bloque agrupa todo lo que hoy ya funciona para operación con
              mesas: cliente desde QR, cocina, mozo y administración de QR.
            </p>

            <div className="mt-5 flex flex-col gap-3">
              <Link
                href="/mesa/1"
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                🍽️ Cliente en Mesa 1
              </Link>

              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href="/cocina"
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  👨‍🍳 Vista de cocina
                </Link>

                <Link
                  href="/mozo/mesas"
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  🧾 Vista de mozo
                </Link>

                <Link
                  href="/admin/productos"
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  🛠️ Admin productos
                </Link>

                <Link
                  href="/admin/mesas"
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  🔗 Mesas y QR
                </Link>
              </div>
            </div>
          </article>

          <article className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Take Away
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Sin mesas
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-bold text-slate-900">
              Flujo de retiro
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Este modo no debería entrar por <code>/mesa/[id]</code>. El siguiente
              paso correcto es crear una ruta pública separada, por ejemplo
              <code> /pedir</code> o <code>/takeaway</code>, para que el cliente
              haga su pedido sin depender de una mesa.
            </p>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                Qué ya está resuelto
              </p>
              <ul className="mt-2 space-y-2 text-sm text-amber-900">
                <li>• El negocio ya puede configurarse como Restaurante o Take Away.</li>
                <li>• Las pantallas de mesas y mozo ya entienden cuándo no aplican.</li>
                <li>• Falta la entrada pública específica para el cliente take away.</li>
              </ul>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <Link
                href="/admin/configuracion"
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                ⚙️ Configurar modo de negocio
              </Link>

              <Link
                href="/admin/productos"
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                🍔 Cargar menú para take away
              </Link>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}