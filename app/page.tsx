'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

function PhoneMockup() {
  // Mockup sin imágenes externas: teléfono + QR + mini menú
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div className="rounded-[28px] border border-black/10 bg-white shadow-sm p-4">
        <div className="rounded-[22px] border border-black/10 bg-gradient-to-b from-zinc-50 to-white p-4">
          <div className="flex items-center justify-between">
            <div className="h-2 w-24 rounded-full bg-zinc-200" />
            <div className="h-6 w-6 rounded-full bg-zinc-200" />
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-black/10 bg-white p-3">
              <div className="text-xs text-zinc-500">Mesa 12</div>
              <div className="mt-0.5 text-sm font-semibold">Menú digital (QR)</div>

              <div className="mt-3 grid grid-cols-[86px_1fr] gap-3 items-center">
                <div className="rounded-xl border border-black/10 bg-white p-2">
                  {/* “QR” estilizado */}
                  <svg viewBox="0 0 64 64" className="h-full w-full">
                    <rect x="6" y="6" width="18" height="18" rx="2" className="fill-zinc-900" />
                    <rect x="10" y="10" width="10" height="10" rx="1" className="fill-white" />

                    <rect x="40" y="6" width="18" height="18" rx="2" className="fill-zinc-900" />
                    <rect x="44" y="10" width="10" height="10" rx="1" className="fill-white" />

                    <rect x="6" y="40" width="18" height="18" rx="2" className="fill-zinc-900" />
                    <rect x="10" y="44" width="10" height="10" rx="1" className="fill-white" />

                    {/* “ruido” QR */}
                    <rect x="28" y="28" width="6" height="6" className="fill-zinc-900" />
                    <rect x="36" y="28" width="4" height="4" className="fill-zinc-900" />
                    <rect x="28" y="38" width="4" height="4" className="fill-zinc-900" />
                    <rect x="44" y="36" width="6" height="6" className="fill-zinc-900" />
                    <rect x="36" y="44" width="4" height="4" className="fill-zinc-900" />
                    <rect x="52" y="28" width="4" height="10" className="fill-zinc-900" />
                  </svg>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold">Cafetería</div>
                    <span className="rounded-full border border-black/10 bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-600">
                      Pedido rápido
                    </span>
                  </div>

                  <div className="grid gap-1.5">
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
                    className="mt-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Ver menú completo
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-black/10 bg-white p-3">
              <div className="text-xs text-zinc-500">Dashboard</div>
              <div className="mt-0.5 text-sm font-semibold">Ventas y rendimiento</div>
              <div className="mt-3 grid gap-2">
                <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                  <div className="h-full w-[68%] bg-blue-600/80" />
                </div>
                <div className="flex justify-between text-[11px] text-zinc-600">
                  <span>Productos top</span>
                  <span>Optimización</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 h-2 w-24 mx-auto rounded-full bg-zinc-200" />
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
    const to = 'contacto@restosmart.com'; // cambiá por tu mail real
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
      {/* Header */}
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
      <span className="font-semibold text-lg leading-none">
        RestoSmart
      </span>
    </div>

    <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-700">
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
        href="/demo"
        className="rounded-full bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Probar demo
      </Link>
    </nav>

    <a
      href="#contacto"
      className="md:hidden rounded-full bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
    >
      Probar demo
    </a>

  </div>
</header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 py-14 md:py-20">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="grid gap-5">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">RestoSmart</h1>

            <p className="text-lg text-zinc-700 leading-relaxed">
              <span className="font-semibold">Software inteligente</span> para restaurantes, bares,
              cafés y take away.
              <br />
              Transformá tu negocio gastronómico <span className="font-semibold"> en un
              negocio inteligente.</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-3">

              <a
                href="#precios"
                className="rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Ver planes y precios
              </a>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 text-center">
              {[
                { k: 'QR', v: 'Menú digital' },
                { k: 'Pedidos', v: 'Más ágiles' },
                { k: 'Data', v: 'Decisiones' },
              ].map((x) => (
                <div key={x.k} className="rounded-2xl border border-black/10 bg-white p-3">
                  <div className="text-sm font-bold">{x.k}</div>
                  <div className="text-xs text-zinc-600">{x.v}</div>
                </div>
              ))}
            </div>
          </div>

          <PhoneMockup />
        </div>
      </section>

      {/* Funciones / Niveles */}
      <section id="funciones" className="border-t border-black/5 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-bold">Funciones de RestoSmart</h2>
            <p className="mt-2 text-zinc-700">
              Tres niveles para que empieces simple y escales cuando lo necesites.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                title: 'Esencial',
                desc: 'Digitalizá tu negocio.',
                bullets: ['Menú digital', 'QR por mesa', 'Gestion esencial', 'Metricas esenciales'],
              },
              {
                title: 'Pro',
                desc: 'Controlá tu negocio.',
                bullets: ['Control de stock', 'Reportes avanzados', 'Dashboard completo', 'Comparativa de datos'],
              },
              {
                title: 'Intelligence',
                desc: 'Optimizá tu negocio',
                bullets: ['KPIs', 'Mapas de calor', 'Analisis inteligente', 'Insights automáticos'],
              },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">{c.title}</h3>
                  <span className="rounded-full border border-black/10 bg-zinc-50 px-3 py-1 text-xs text-zinc-600">
                    Nivel
                  </span>
                </div>

                <p className="mt-3 text-sm text-zinc-700 leading-relaxed">{c.desc}</p>

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
        </div>
      </section>

      {/* Precios */}
      <section id="precios" className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-bold">Planes y precios</h2>
            <p className="mt-2 text-zinc-700">Elegí el nivel que mejor se adapta a tu negocio.</p>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {/* Esencial */}
            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">Esencial</h3>
              <div className="mt-4 text-3xl font-bold text-blue-600">
                $12.000 <span className="text-sm text-zinc-500 font-medium">/ mes</span>
              </div>
              <ul className="mt-6 grid gap-2 text-sm text-zinc-700">
                <li>✔ Menú digital QR</li>
                <li>✔ Edición de productos</li>
                <li>✔ QR por mesa</li>
                <li>✔ Metricas esenciales</li>
              </ul>

            </div>

            {/* Pro */}
            <div className="rounded-3xl border-2 border-blue-600 bg-white p-6 shadow-md relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs text-white">
                Más elegido
              </div>

              <h3 className="text-lg font-bold">Pro</h3>
              <div className="mt-4 text-3xl font-bold text-blue-600">
                $35.000 <span className="text-sm text-zinc-500 font-medium">/ mes</span>
              </div>
              <ul className="mt-6 grid gap-2 text-sm text-zinc-700">
                <li>✔ Todo lo del plan Esencial</li>
                <li>✔ Gestión de stock</li>
                <li>✔ Reportes de ventas</li>
                <li>✔ Rendimiento por producto</li>
              </ul>

            </div>

            {/* Intelligence */}
            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">Intelligence</h3>
              <div className="mt-4 text-3xl font-bold text-blue-600">
                $50.000 <span className="text-sm text-zinc-500 font-medium">/ mes</span>
              </div>
              <ul className="mt-6 grid gap-2 text-sm text-zinc-700">
                <li>✔ Todo lo del plan Pro</li>
                <li>✔ Dashboard completo</li>
                <li>✔ Productos más vendidos</li>
                <li>✔ Análisis y optimización</li>
              </ul>

            </div>
          </div>

          <div className="mt-6 text-xs text-zinc-500">
            Precios mensuales. Podemos ayudarte a elegir el plan según tu operación (salón / take
            away / múltiples mesas).
          </div>
        </div>
      </section>

      {/* 3 pasos */}
      <section id="pasos" className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-bold">3 pasos simples</h2>
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
                title: 'Tus clientes escanean el QR',
                desc: 'Acceden al menú y realizan acciones en segundos.',
              },
              {
                n: '3',
                title: 'Analizás y optimizás',
                desc: 'Medí rendimiento y tomá decisiones con datos.',
              },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-600 text-white font-bold">
                    {s.n}
                  </div>
                  <h3 className="text-lg font-bold">{s.title}</h3>
                </div>
                <p className="mt-3 text-sm text-zinc-700 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quiénes somos */}
      <section id="quienes" className="border-t border-black/5 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold">Quiénes somos</h2>
              <p className="mt-3 text-zinc-700 leading-relaxed">
                En <span className="font-semibold">RestoSmart</span> desarrollamos soluciones
                tecnológicas para el sector gastronómico, combinando software, análisis de datos y
                experiencia en negocio.
              </p>

              <div className="mt-5 grid gap-3">
                {[
                  'Implementación rápida y simple',
                  'Pensado para operación real (cocina + salón)',
                  'Escalable: de menú QR a inteligencia de negocio',
                ].map((t) => (
                  <div key={t} className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
                    {t}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold">Lo que buscamos</div>
              <p className="mt-2 text-sm text-zinc-700 leading-relaxed">
                Menos fricción operativa, más ventas, y decisiones claras basadas en datos.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { k: 'Operación', v: 'Más orden' },
                  { k: 'Clientes', v: 'Mejor experiencia' },
                  { k: 'Ventas', v: 'Más conversión' },
                  { k: 'Datos', v: 'Optimización' },
                ].map((x) => (
                  <div key={x.k} className="rounded-2xl border border-black/10 bg-zinc-50 p-4">
                    <div className="text-xs text-zinc-500">{x.k}</div>
                    <div className="text-sm font-bold">{x.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-4xl px-5 py-14">
          <h2 className="text-2xl md:text-3xl font-bold">Preguntas frecuentes</h2>

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
                a: 'Sí. Se adapta tanto a salón como a modalidad de retiro/take away.',
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
            ].map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
              >
                <summary className="cursor-pointer list-none font-semibold text-zinc-900 flex items-center justify-between">
                  <span>{item.q}</span>
                  <span className="ml-4 text-blue-600 group-open:rotate-45 transition-transform">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-zinc-700 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section id="contacto" className="border-t border-black/5 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-bold">Contactenos</h2>
            <p className="mt-2 text-zinc-700">
              Contanos tu negocio y te brindamos el mejor plan para tu negocio.
            </p>
          </div>

<div className="mt-10">
  <form
    onSubmit={onSubmit}
    className="w-full rounded-3xl border border-black/10 bg-white p-8 shadow-sm"
  >
    <div className="grid gap-6 md:grid-cols-2">

      {/* Nombre */}
      <div className="grid gap-2">
        <label className="text-sm font-semibold">Nombre</label>
        <input
          className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-blue-600"
          value={form.nombre}
          onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
          required
        />
      </div>

      {/* Email */}
      <div className="grid gap-2">
        <label className="text-sm font-semibold">Email</label>
        <input
          type="email"
          className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-blue-600"
          value={form.email}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          required
        />
      </div>

      {/* Teléfono */}
      <div className="grid gap-2">
        <label className="text-sm font-semibold">Teléfono (opcional)</label>
        <input
          className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-blue-600"
          value={form.telefono}
          onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))}
          placeholder="Ej: 11 1234-5678"
        />
      </div>

      {/* Negocio */}
      <div className="grid gap-2">
        <label className="text-sm font-semibold">Tipo de negocio</label>
        <input
          className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-blue-600"
          value={form.negocio}
          onChange={(e) => setForm((p) => ({ ...p, negocio: e.target.value }))}
          placeholder="Restaurante / bar / café / take away"
        />
      </div>

      {/* Mensaje ocupa las dos columnas */}
      <div className="grid gap-2 md:col-span-2">
        <label className="text-sm font-semibold">Mensaje</label>
        <textarea
          className="min-h-[140px] rounded-2xl border border-black/10 bg-white p-4 text-sm outline-none focus:border-blue-600"
          value={form.mensaje}
          onChange={(e) => setForm((p) => ({ ...p, mensaje: e.target.value }))}
          placeholder="Contanos qué necesitás o qué plan te interesa."
          required
        />
      </div>

      {/* Botón ocupa las dos columnas */}
      <div className="md:col-span-2 flex justify-center">
        <button
          type="submit"
          className="rounded-2xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Enviar consulta
        </button>
      </div>

      {sent && (
        <div className="md:col-span-2 text-center text-sm text-zinc-600">
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

      {/* CTA Final */}
      <section className="border-t border-black/5 bg-blue-600">
        <div className="mx-auto max-w-6xl px-5 py-14 text-center text-white">
          <h2 className="text-3xl font-bold">¿Listo para transformar tu negocio gastronomico?</h2>
          <p className="mt-4 text-blue-100 max-w-2xl mx-auto">
            Implementá RestoSmart en pocos días y empezá a operar con datos, eficiencia y control.
          </p>
          <a
            href="/demo"
            className="mt-8 inline-block rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50"
          >
            Probar demo
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-zinc-600">
              <span className="font-semibold text-zinc-900">RestoSmart</span> — Software para
              gastronomía
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              {/* Sin redes por ahora: dejamos placeholders */}
              <span className="text-zinc-400">Instagram (próximamente)</span>
              <a
                className="text-zinc-700 hover:text-zinc-900 underline"
                href="mailto:contacto@restosmart.com"
              >
                E-mail
              </a>
              <Link className="text-zinc-700 hover:text-zinc-900 underline" href="/privacidad">
                Política de privacidad
              </Link>
              <Link className="text-zinc-700 hover:text-zinc-900 underline" href="/terminos">
                Términos
              </Link>
            </div>
          </div>

          <div className="mt-6 text-xs text-zinc-500">
            © {new Date().getFullYear()} RestoSmart. Todos los derechos reservados.
          </div>
        </div>
      </footer>

      {/* Como no tenés WhatsApp aún, dejamos botón flotante a Contacto */}
      <ContactFloat />
    </main>
  );
}