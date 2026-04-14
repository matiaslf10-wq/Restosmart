'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type QuickLink = {
  href: string;
  title: string;
  description: string;
};

function QuickAccessCard({ href, title, description }: QuickLink) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow"
    >
      <div className="text-base font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {description}
      </p>
    </Link>
  );
}

export default function InicioPage() {
  const [mesaInput, setMesaInput] = useState('1');

  const mesaId = useMemo(() => {
    const parsed = Number.parseInt(mesaInput, 10);
    if (Number.isNaN(parsed) || parsed < 1) return 1;
    return parsed;
  }, [mesaInput]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
            RestoSmart
          </p>

          <h1 className="mt-2 text-4xl font-bold text-slate-900">Inicio</h1>

          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
            Esta pantalla funciona como antesala después del login. Desde acá
            elegís a qué vista querés entrar según tu función dentro del local:
            administración, cocina, mostrador/caja, mozo, generación de QR o
            acceso del cliente.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Ir al panel admin
            </Link>

            <Link
              href="/cocina"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Abrir cocina
            </Link>

            <Link
              href="/mostrador"
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              Abrir mostrador / caja
            </Link>

            <Link
              href="/mozo/mesas"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Abrir mozo
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <QuickAccessCard
            href="/admin"
            title="🛠️ Administración"
            description="Entrá al panel principal para operar el sistema, revisar configuraciones y gestionar el negocio."
          />

          <QuickAccessCard
            href="/cocina"
            title="👨‍🍳 Cocina"
            description="Vista operativa para preparación de pedidos y seguimiento del trabajo de cocina."
          />

          <QuickAccessCard
            href="/mostrador"
            title="🧾 Mostrador / Caja"
            description="Pantalla central para operación diaria, cobro, entrega y cierre, tanto en salón como en take away."          />

          <QuickAccessCard
            href="/mozo/mesas"
            title="🍽️ Mozo"
            description="Acceso rápido al flujo de salón para visualizar mesas, pedidos y atención operativa del mozo."          />

          <QuickAccessCard
            href="/admin/mesas"
            title="🔗 Crear QR"
            description="Entrá a la administración de mesas y QR para generar, imprimir o revisar accesos de mesa."
          />

          <QuickAccessCard
            href="/retiro"
            title="📺 Pantalla de retiro"
            description="Pantalla pública para mostrar los pedidos take away listos para retirar por nombre y código."
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                Restaurante
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Con mesas
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-bold text-slate-900">
              Acceso del cliente por mesa
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Para el flujo de salón, el cliente entra por una mesa específica.
              Podés abrir una mesa manualmente desde acá para probar o validar el
              recorrido.
            </p>

            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <label className="block text-sm font-semibold text-emerald-900">
                ID de mesa
              </label>

              <input
                type="number"
                min={1}
                value={mesaInput}
                onChange={(e) => setMesaInput(e.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-emerald-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-500"
              />

              <p className="mt-2 text-xs text-emerald-900/80">
                Esto abre la ruta <code>/mesa/{mesaId}</code>.
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href={`/mesa/${mesaId}`}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Abrir mesa {mesaId}
              </Link>

              <Link
                href="/mostrador"
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
              >
                Abrir caja / salón
              </Link>

              <Link
                href="/admin/mesas"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Revisar mesas y QR
              </Link>
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Take Away
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Sin mesas
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-bold text-slate-900">
              Acceso del cliente sin mesa
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              En take away el cliente no necesita una mesa. El ingreso público se
              resuelve desde la ruta <code>/pedir</code>, la pantalla pública de
              retiro queda disponible en <code>/retiro</code> y la entrega final se
              confirma desde <code>/mostrador</code>.
            </p>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                Desde este inicio seguís entrando a las mismas vistas internas:
                admin, cocina, mostrador/caja, mozo y QR. Lo que cambia es el
                acceso del cliente y la pantalla visible para avisar que el pedido
                ya está listo.
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/pedir"
                className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-600"
              >
                Abrir take away
              </Link>

              <Link
                href="/mostrador"
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
              >
                Abrir mostrador / caja
              </Link>

              <Link
                href="/retiro"
                className="rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
              >
                Abrir pantalla de retiro
              </Link>

              <Link
                href="/admin"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Ir al admin
              </Link>
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Flujo esperado del sistema
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {[
              {
                step: '1',
                title: 'Página principal',
                desc: 'Entrada pública comercial del producto.',
              },
              {
                step: '2',
                title: 'Login',
                desc: 'Ingreso del usuario con credenciales.',
              },
              {
                step: '3',
                title: 'Inicio',
                desc: 'Selección de la vista según la función.',
              },
              {
                step: '4',
                title: 'Operación',
                desc: 'Admin, cocina, mostrador/caja, mozo, QR o acceso cliente.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-slate-900 text-sm font-bold text-white">
                  {item.step}
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">
                  {item.title}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}