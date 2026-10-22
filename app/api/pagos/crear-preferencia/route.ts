import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// B7: circuito de pagos del bot de WhatsApp excluido del piloto.
// Ninguna solicitud debe generar cobros ni modificar pedidos.
export async function POST() {
  return NextResponse.json(
    { error: 'Servicio no disponible en el piloto.' },
    { status: 404 }
  );
}