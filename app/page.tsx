'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const LOGIN_HREF = '/login';

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div className="rounded-[28px] border border-black/10 bg-white p-4 shadow-sm">
        <div className="rounded-[22px] border border-black/10 bg-gradient-to-b from-zinc-50 to-white p-4">
          <div className="flex items-center justify-between">
            <div className="h-2 w-24 rounded-full bg-zinc-200" />
            <div className="h-6 w-6 rounded-full bg-zinc-200" />
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-black/10 bg-white p-3">
              <div className="text-xs text-zinc-500">Plan Esencial</div>
              <div className="mt-0.5 text-sm font-semibold">
                Un mismo sistema, dos modos
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-black/10 bg-zinc-50 px-2 py-1 text-[10px] text-zinc-700">
                  Restaurante
                </span>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] text-blue-700">
                  Take Away
                </span>
              </div>

              <div className="mt-3 grid gap-2">
                <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
                  <div className="text-[11px] text-zinc-500">Modo restaurante</div>
                  <div className="mt-0.5 text-xs font-semibold">
                    QR por mesa · pedido digital · salón
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
                  <div className="text-[11px] text-zinc-500">Modo take away</div>
                  <div className="mt-0.5 text-xs font-semibold">
                    Pedido local · retiro en mostrador
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-black/10 bg-white p-3">
              <div className="text-xs text-zinc-500">Menú digital</div>
              <div className="mt-0.5 text-sm font-semibold">
                Experiencia simple para el cliente
              </div>

              <div className="mt-3 grid gap-1.5">
                {[
                  { name: 'Flat White', price: '$ 3.200' },
                  { name: 'Medialunas', price: '$ 1.800' },
                  { name: 'Tostado', price: '$ 4.500' },
                ].map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-3 py-2"
                  >
                    <div className="text-xs text-zinc-800">{p.name}</div>
                    <div className="text-xs font-semibold">{p.price}</div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="mt-3 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Confirmar pedido
              </button>
            </div>

            <div className="rounded-2xl border border-black/10 bg-white p-3">
              <div className="text-xs text-zinc-500">Operación</div>
              <div className="mt-0.5 text-sm font-semibold">
                Más control del local
              </div>
              <div className="mt-3 grid gap-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full w-[68%] bg-blue-600/80" />
                </div>
                <div className="flex justify-between text-[11px] text-zinc-600">
                  <span>Base</span>
                  <span>Control</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-4 h-2 w-24 rounded-full bg-zinc-200" />
        </div>
      </div>

      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-r from-blue-50 to-white blur-2xl" />
    </div>
  );
}

function ContactFloat() {
  return (
    <a
      href="#contacto"
      className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-700 active:scale-[0.98]"
      aria-label="Ir a contacto"
      title="Ir a contacto"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
          <path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11A2.5 2.5 0 0 1 19.5 20h-15A2.5 2.5 0 0 1 2 17.5v-11Zm2.7-.5 7.1 5.2c.7.5 1.7.5 2.4 0L21.3 6H4.7Z" />
        </svg>
      </span>
      Contacto
    </a>
  );
}

export default function RestoSmartLanding() {
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    telefono: '',
    negocio: '',
    mensaje: '',
  });
  const [sent, setSent] = useState(false);

  const mailToHref = useMemo(() => {
    const to = 'contacto@restosmart.com';
    const subject = encodeURIComponent('Contacto — RestoSmart (Demo)');
    const body = encodeURIComponent(
      `Nombre: ${form.nombre}\nEmail: ${form.email}\nTeléfono: ${form.telefono}\nNegocio: ${form.negocio}\n\nMensaje:\n${form.mensaje}`
    );
    return `mailto:${to}?subject=${subject}&body=${body}`;
  }, [form]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    window.location.href = mailToHref;
    setSent(true);
  }

  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="relative h-16 w-16">
              <Image
                src="/logo-smart.png"
                alt="RestoSmart"
                fill
                className="object-contain"
                priority
              />
            </div>
            <span className="text-lg font-semibold leading-none">RestoSmart</span>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-zinc-700 md:flex">
            <a href="#funciones" className="hover:text-zinc-900">
              Funciones
            </a>
            <a href="#precios" className="hover:text-zinc-900">
              Precios
            </a>
            <a href="#pasos" className="hover:text-zinc-900">
              Cómo funciona
            </a>
            <a href="#faq" className="hover:text-zinc-900">
              FAQ
            </a>

            <Link
              href={LOGIN_HREF}
              className="rounded-full border border-black/10 px-4 py-2 text-zinc-900 hover:bg-zinc-50"
            >
              Ingresar
            </Link>

            <Link
              href="/demo"
              className="rounded-full bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Probar demo
            </Link>
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <Link
              href={LOGIN_HREF}
              className="rounded-full border border-black/10 px-4 py-2 text-sm text-zinc-900 hover:bg-zinc-50"
            >
              Ingresar
            </Link>

            <Link
              href="/demo"
              className="rounded-full bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              Probar demo
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-14 md:py-20">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="grid gap-5">
            <div className="inline-flex w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              Un solo sistema · Restaurante o Take Away
            </div>

            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              RestoSmart
            </h1>

            <p className="text-lg leading-relaxed text-zinc-700">
              <span className="font-semibold">Software inteligente</span> para
              restaurantes, bares, cafés y take away.
              <br />
              Un solo producto para operar{' '}
              <span className="font-semibold">con mesas o sin mesas</span>, según
              cómo trabaje tu negocio.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href="#precios"
                className="rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Ver planes y precios
              </a>

              <Link
                href={LOGIN_HREF}
                className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                Ingresar al sistema
              </Link>

              <a
                href="#contacto"
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Quiero una propuesta
              </a>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 text-center">
              {[
                { k: 'Modo', v: 'Restaurante o take away' },
                { k: 'Operación', v: 'Más orden diario' },
                { k: 'Data', v: 'Decisiones' },
              ].map((x) => (
                <div
                  key={x.k}
                  className="rounded-2xl border border-black/10 bg-white p-3"
                >
                  <div className="text-sm font-bold">{x.k}</div>
                  <div className="text-xs text-zinc-600">{x.v}</div>
                </div>
              ))}
            </div>
          </div>

          <PhoneMockup />
        </div>
      </section>

      <section className="border-t border-black/5 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold md:text-3xl">
              Un solo sistema, dos formas de operar
            </h2>
            <p className="mt-2 text-zinc-700">
              El plan no cambia por el tipo de negocio. Lo que cambia es el modo de
              operación.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                🍽️ Restaurante
              </div>

              <h3 className="mt-4 text-xl font-bold">Con mesas y salón</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700">
                Ideal para locales donde la identificación del pedido se organiza por
                mesa y la experiencia del cliente arranca desde un QR en el salón.
              </p>

              <ul className="mt-4 grid gap-2 text-sm text-zinc-800">
                {[
                  'QR por mesa',
                  'Pedido desde mesa',
                  'Cuenta y pago desde el celular',
                  'Flujo de salón',
                ].map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                🛍️ Take Away
              </div>

              <h3 className="mt-4 text-xl font-bold">Sin mesas, con retiro</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700">
                Ideal para negocios donde el pedido se identifica por cliente o por
                número de orden y el retiro se resuelve en mostrador.
              </p>

              <ul className="mt-4 grid gap-2 text-sm text-zinc-800">
                {[
                  'Pedido local o retiro',
                  'Sin depender de mesas',
                  'Menú digital adaptado',
                  'Misma base para escalar después',
                ].map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="funciones" className="border-t border-black/5 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold md:text-3xl">
              Funciones de RestoSmart
            </h2>
            <p className="mt-2 text-zinc-700">
              Esencial ordena la base, Pro amplía la operación diaria e Intelligence
              agrega analítica avanzada.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                title: 'Esencial',
                desc: 'Vendé y operá con una base simple, clara y lista para usar.',
                bullets: [
                  'Gestión de productos y categorías',
                  'Menú digital',
                  'Modo restaurante o take away',
                  'QR por mesa si operás con salón',
                  'Cocina y operación básica',
                ],
              },
              {
                title: 'Pro',
                desc: 'Ganás más control sobre la operación diaria del local.',
                bullets: [
                  'Todo lo de Esencial',
                  'Gestión operativa ampliada',
                  'Mostrador / caja como centro operativo',
                  'Modo mozo para restaurante',
                  'Más coordinación entre salón, cocina y caja',
                ],
              },
              {
                title: 'Intelligence',
                desc: 'Optimizá el negocio con datos, KPIs e insights.',
                bullets: [
                  'Todo lo de Pro',
                  'Analytics avanzados',
                  'KPIs operativos y comerciales',
                  'Vista ejecutiva',
                  'Mejores decisiones con datos',
                ],
              },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">{c.title}</h3>
                  <span className="rounded-full border border-black/10 bg-zinc-50 px-3 py-1 text-xs text-zinc-600">
                    Plan
                  </span>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-zinc-700">
                  {c.desc}
                </p>

                <ul className="mt-4 grid gap-2 text-sm text-zinc-800">
                  {c.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-violet-200 bg-white p-6 shadow-sm">
  <div className="max-w-2xl">
    <div className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
      Add-ons opcionales
    </div>

    <h3 className="mt-3 text-xl font-bold">Módulos para crecer según tu operación</h3>

    <p className="mt-2 text-sm leading-relaxed text-zinc-700">
      Sumá funcionalidades específicas sin cambiar el plan base. Los add-ons se
      activan por local y se contratan por separado.
    </p>
  </div>

  <div className="mt-5 grid gap-4 md:grid-cols-3">
    <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
      <p className="text-sm font-semibold text-violet-900">WhatsApp Delivery</p>
      <p className="mt-2 text-sm leading-relaxed text-violet-900">
        Pedidos por WhatsApp integrados a la operación de RestoSmart.
      </p>
      <p className="mt-3 text-xs font-semibold text-violet-700">
        Cotización aparte
      </p>
    </div>

    <div className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50 p-4">
      <p className="text-sm font-semibold text-fuchsia-900">Multimarca</p>
      <p className="mt-2 text-sm leading-relaxed text-fuchsia-900">
        Vendé varias marcas desde el mismo local, sin duplicar pantallas ni operación.
      </p>
      <p className="mt-3 text-xs font-semibold text-fuchsia-700">
        Pro: + $15.000/mes · hasta 3 marcas
      </p>
      <p className="mt-1 text-xs font-semibold text-fuchsia-700">
        Intelligence: + $25.000/mes · ilimitado
      </p>
    </div>

    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Facturación ARCA</p>
      <p className="mt-2 text-sm leading-relaxed text-amber-900">
        Módulo futuro para asistir la emisión y gestión de comprobantes legales.
      </p>
      <p className="mt-3 text-xs font-semibold text-amber-700">
        Próximamente
      </p>
    </div>
  </div>
</div>
        </div>
      </section>

      <section className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6">
            <div className="inline-flex rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
              Plan Pro
            </div>

            <h2 className="mt-4 text-2xl font-bold md:text-3xl">
              Más control operativo sin pasar todavía a analytics
            </h2>

            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-700">
              Pro está pensado para negocios que ya no solo necesitan digitalizar la
              base, sino también ordenar mejor el trabajo diario. Es el punto medio
              entre una operación simple y una gestión con lectura analítica avanzada.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                {
                  title: 'Operación diaria',
                  desc: 'Más orden en la coordinación entre cocina, mostrador y atención.',
                },
                {
                  title: 'Salón',
                  desc: 'En restaurante suma modo mozo para distribuir mejor la atención de mesas.',
                },
                {
                  title: 'Escalabilidad',
                  desc: 'Te deja mejor parado para después sumar analytics con Intelligence.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-blue-200 bg-white p-4"
                >
                  <div className="text-sm font-semibold text-zinc-900">
                    {item.title}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-700">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="precios" className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold md:text-3xl">Planes y precios</h2>
            <p className="mt-2 text-zinc-700">
  Elegí el plan que mejor se adapta a tu operación. Los add-ons se contratan
  aparte por local, según las necesidades de cada restaurante.
</p>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold">Esencial</h3>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700">
                  Ideal para take away
                </span>
              </div>

              <div className="mt-4 text-3xl font-bold text-blue-600">
                $12.000{' '}
                <span className="text-sm font-medium text-zinc-500">/ mes</span>
              </div>
              <ul className="mt-6 grid gap-2 text-sm text-zinc-700">
                <li>✔ Gestión de productos y categorías</li>
                <li>✔ Menú digital</li>
                <li>✔ Restaurante o take away</li>
                <li>✔ QR por mesa si operás con salón</li>
                <li>✔ Cocina y operación básica</li>
              </ul>
            </div>

            <div className="relative rounded-3xl border-2 border-blue-600 bg-white p-6 shadow-md">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs text-white">
                Más elegido
              </div>

              <h3 className="text-lg font-bold">Pro</h3>
              <div className="mt-4 text-3xl font-bold text-blue-600">
                $35.000{' '}
                <span className="text-sm font-medium text-zinc-500">/ mes</span>
              </div>
              <ul className="mt-6 grid gap-2 text-sm text-zinc-700">
                <li>✔ Todo lo del plan Esencial</li>
                <li>✔ Gestión operativa ampliada</li>
                <li>✔ Más control del flujo diario</li>
                <li>✔ Modo mozo para restaurante</li>
                <li>✔ Más coordinación del local</li>
              </ul>

              <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-800">
                Ideal si necesitás más control operativo. Los analytics avanzados
                recién aparecen en Intelligence.
              </div>
            </div>

            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">Intelligence</h3>
              <div className="mt-4 text-3xl font-bold text-blue-600">
                $50.000{' '}
                <span className="text-sm font-medium text-zinc-500">/ mes</span>
              </div>
              <ul className="mt-6 grid gap-2 text-sm text-zinc-700">
                <li>✔ Todo lo del plan Pro</li>
                <li>✔ Analytics avanzados</li>
                <li>✔ KPIs y rendimiento</li>
                <li>✔ Vista ejecutiva</li>
                <li>✔ Insights para optimizar el negocio</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-black/10 bg-zinc-50 p-6">
  <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
    <div>
      <h3 className="text-xl font-bold text-zinc-900">Add-ons disponibles</h3>
      <p className="mt-1 text-sm text-zinc-700">
        Funcionalidades opcionales para sumar según la operación del local.
      </p>
    </div>

    <p className="text-xs text-zinc-500">
      Se contratan por local y no forman parte del plan base.
    </p>
  </div>

  <div className="mt-5 grid gap-4 md:grid-cols-3">
    <div className="rounded-2xl border border-violet-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-zinc-900">WhatsApp Delivery</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700">
            Pedidos por WhatsApp conectados a la operación del local.
          </p>
        </div>

        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
          Add-on
        </span>
      </div>

      <p className="mt-4 text-lg font-bold text-violet-800">Cotización aparte</p>
      <p className="mt-1 text-xs text-zinc-500">
        No incluido en ningún plan base.
      </p>
    </div>

    <div className="rounded-2xl border border-fuchsia-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-zinc-900">Multimarca</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700">
            Varias marcas dentro del mismo local, con operación unificada.
          </p>
        </div>

        <span className="rounded-full bg-fuchsia-50 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-700">
          Add-on
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="font-semibold">Esencial:</span> no disponible
        </div>
        <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50 px-3 py-2 text-fuchsia-900">
          <span className="font-semibold">Pro:</span> + $15.000/mes · hasta 3 marcas
        </div>
        <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50 px-3 py-2 text-fuchsia-900">
          <span className="font-semibold">Intelligence:</span> + $25.000/mes · marcas ilimitadas
        </div>
      </div>
    </div>

    <div className="rounded-2xl border border-amber-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-zinc-900">Facturación ARCA</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700">
            Futuro módulo para asistir la emisión y gestión de comprobantes.
          </p>
        </div>

        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          Próximamente
        </span>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-zinc-600">
        La activación deberá contemplar configuración fiscal, condiciones
        comerciales y aclaraciones legales específicas.
      </p>
    </div>
  </div>
</div>

          <div className="mt-6 text-xs text-zinc-500">
  Los planes se contratan por local. El modo del negocio puede ser restaurante
  o take away. Los add-ons se contratan aparte y pueden tener disponibilidad,
  límites o condiciones según el plan.
</div>
        </div>
      </section>

      <section id="pasos" className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold md:text-3xl">3 pasos simples</h2>
            <p className="mt-2 text-zinc-700">
              Implementación rápida para empezar a ver resultados sin complicarte.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                n: '1',
                title: 'Configurás tu menú',
                desc: 'Cargá categorías, productos, fotos y precios. Todo editable.',
              },
              {
                n: '2',
                title: 'Elegís cómo operás',
                desc: 'Definís si tu negocio trabaja con mesas o en modalidad take away.',
              },
              {
                n: '3',
                title: 'Operás y optimizás',
                desc: 'Ordená la operación y, según tu plan, medí rendimiento y tomá decisiones con datos.',
              },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-600 font-bold text-white">
                    {s.n}
                  </div>
                  <h3 className="text-lg font-bold">{s.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-zinc-700">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="quienes" className="border-t border-black/5 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-2xl font-bold md:text-3xl">Quiénes somos</h2>
              <p className="mt-3 leading-relaxed text-zinc-700">
                En <span className="font-semibold">RestoSmart</span> desarrollamos
                soluciones tecnológicas para el sector gastronómico, combinando
                software, análisis de datos y experiencia en negocio.
              </p>

              <div className="mt-5 grid gap-3">
                {[
                  'Implementación rápida y simple',
                  'Pensado para operación real: salón, cocina y take away',
                  'Escalable: de operación base a inteligencia de negocio',
                ].map((t) => (
                  <div
                    key={t}
                    className="rounded-2xl border border-black/10 bg-white p-4 text-sm"
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold">Lo que buscamos</div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700">
                Menos fricción operativa, más ventas, y decisiones claras basadas en
                datos.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { k: 'Operación', v: 'Más orden' },
                  { k: 'Clientes', v: 'Mejor experiencia' },
                  { k: 'Ventas', v: 'Más conversión' },
                  { k: 'Datos', v: 'Optimización' },
                ].map((x) => (
                  <div
                    key={x.k}
                    className="rounded-2xl border border-black/10 bg-zinc-50 p-4"
                  >
                    <div className="text-xs text-zinc-500">{x.k}</div>
                    <div className="text-sm font-bold">{x.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-4xl px-5 py-14">
          <h2 className="text-2xl font-bold md:text-3xl">Preguntas frecuentes</h2>

          <div className="mt-8 grid gap-4">
            {[
              {
                q: '¿Necesito instalar algo?',
                a: 'No. RestoSmart funciona desde el navegador. Solo necesitás internet.',
              },
              {
                q: '¿Cuánto tarda la implementación?',
                a: 'En pocos días podés tener tu menú digital funcionando y el circuito operativo listo.',
              },
              {
                q: '¿Puedo modificar el menú yo mismo?',
                a: 'Sí. Podés cambiar productos, precios y disponibilidad en tiempo real desde el panel.',
              },
              {
                q: '¿Funciona para take away?',
                a: 'Sí. El mismo sistema puede configurarse para operar en modo restaurante o en modo take away, sin convertirlo en otro plan.',
              },
              {
                q: '¿Take away es un plan distinto?',
                a: 'No. Take away no es un plan separado: es una forma de operar el negocio dentro del sistema.',
              },
              {
                q: '¿Qué agrega Pro concretamente?',
                a: 'Pro suma gestión operativa ampliada. En restaurante además habilita modo mozo. Es el plan pensado para ganar más control en la operación diaria, sin entrar todavía en analytics avanzados.',
              },
              {
                q: '¿Qué pasa si se rompe o se pierde un QR?',
                a: 'Se genera uno nuevo en segundos y lo reemplazás por el nuevo impreso.',
              },
              {
                q: '¿Hay soporte?',
                a: 'Sí. Te acompañamos para que el sistema funcione correctamente en tu negocio.',
              },
              {
                q: '¿Puedo empezar con Esencial y luego pasar a Pro o Intelligence?',
                a: 'Sí. Los planes están pensados para escalar según tu operación.',
              },
              {
                q: '¿WhatsApp Delivery está incluido en algún plan?',
                a: 'No. WhatsApp Delivery se contrata aparte como add-on opcional por restaurante y no forma parte de las funcionalidades comunes de Esencial, Pro o Intelligence.',
              },
              {
  q: '¿Qué es Multimarca?',
  a: 'Multimarca permite administrar varias marcas internas dentro del mismo local, manteniendo una sola operación. Es útil para dark kitchens, marcas virtuales o restaurantes que quieren vender distintas propuestas desde la misma cocina.',
},
{
  q: '¿Multimarca está incluido en los planes?',
  a: 'No. Es un add-on aparte. En Esencial no está disponible; en Pro permite hasta 3 marcas por $15.000 adicionales al mes; en Intelligence permite marcas ilimitadas por $25.000 adicionales al mes.',
},
            ].map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-zinc-900">
                  <span>{item.q}</span>
                  <span className="ml-4 text-blue-600 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-zinc-700">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="contacto" className="border-t border-black/5 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold md:text-3xl">Contáctenos</h2>
            <p className="mt-2 text-zinc-700">
              Contanos tu negocio y te brindamos el mejor plan para tu operación.
            </p>
          </div>

          <div className="mt-10">
            <form
              onSubmit={onSubmit}
              className="w-full rounded-3xl border border-black/10 bg-white p-8 shadow-sm"
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-semibold">Nombre</label>
                  <input
                    className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-blue-600"
                    value={form.nombre}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, nombre: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold">Email</label>
                  <input
                    type="email"
                    className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-blue-600"
                    value={form.email}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, email: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold">Teléfono (opcional)</label>
                  <input
                    className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-blue-600"
                    value={form.telefono}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, telefono: e.target.value }))
                    }
                    placeholder="Ej: 11 1234-5678"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold">Tipo de negocio</label>
                  <input
                    className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-blue-600"
                    value={form.negocio}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, negocio: e.target.value }))
                    }
                    placeholder="Restaurante / bar / café / take away"
                  />
                </div>

                <div className="grid gap-2 md:col-span-2">
                  <label className="text-sm font-semibold">Mensaje</label>
                  <textarea
                    className="min-h-[140px] rounded-2xl border border-black/10 bg-white p-4 text-sm outline-none focus:border-blue-600"
                    value={form.mensaje}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, mensaje: e.target.value }))
                    }
                    placeholder="Contanos qué necesitás, cuántos locales tenés, si operás con mesas o take away y qué plan te interesa."
                    required
                  />
                </div>

                <div className="flex justify-center md:col-span-2">
                  <button
                    type="submit"
                    className="rounded-2xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Enviar consulta
                  </button>
                </div>

                {sent && (
                  <div className="text-center text-sm text-zinc-600 md:col-span-2">
                    Si no se abrió tu correo, escribinos a{' '}
                    <a className="underline" href="mailto:contacto@restosmart.com">
                      contacto@restosmart.com
                    </a>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      </section>

      <section className="border-t border-black/5 bg-blue-600">
        <div className="mx-auto max-w-6xl px-5 py-14 text-center text-white">
          <h2 className="text-3xl font-bold">
            ¿Listo para transformar tu negocio gastronómico?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-blue-100">
            Implementá RestoSmart en pocos días y empezá a operar con más control,
            mejor experiencia y decisiones más claras.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={LOGIN_HREF}
              className="inline-block rounded-2xl border border-white/30 bg-white px-6 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50"
            >
              Ingresar al sistema
            </Link>

            <Link
              href="/demo"
              className="inline-block rounded-2xl border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Probar demo
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-zinc-600">
              <span className="font-semibold text-zinc-900">RestoSmart</span> —
              Software para gastronomía
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-zinc-400">Instagram (próximamente)</span>
              <a
                className="text-zinc-700 underline hover:text-zinc-900"
                href="mailto:contacto@restosmart.com"
              >
                E-mail
              </a>
              <Link
                className="text-zinc-700 underline hover:text-zinc-900"
                href="/privacidad"
              >
                Política de privacidad
              </Link>
              <Link
                className="text-zinc-700 underline hover:text-zinc-900"
                href="/terminos"
              >
                Términos
              </Link>
            </div>
          </div>

          <div className="mt-6 text-xs text-zinc-500">
            © {new Date().getFullYear()} RestoSmart. Todos los derechos reservados.
          </div>
        </div>
      </footer>

      <ContactFloat />
    </main>
  );
}