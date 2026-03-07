import { NextRequest, NextResponse } from 'next/server';

function extractTenant(host: string | null) {
  if (!host) return null;

  const hostname = host.split(':')[0]; // quitar puerto
  const parts = hostname.split('.');

  // Dev local con lvh.me
  if (hostname.endsWith('lvh.me') && parts.length >= 3) {
    return parts[0];
  }

  // Producción: lospinos.tudominio.com
  if (parts.length >= 3 && parts[0] !== 'www') {
    return parts[0];
  }

  return null;
}

export function middleware(req: NextRequest) {
  const tenant = extractTenant(req.headers.get('host'));

  const response = NextResponse.next();

  if (tenant) {
    response.headers.set('x-tenant', tenant);
  }

  return response;
}

export const config = {
  matcher: '/((?!_next|favicon.ico).*)',
};