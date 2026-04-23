import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const ADMIN_COOKIE_NAME = 'restosmart_admin_session';
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 horas

export type AdminSession = {
  adminId: string;
  email: string;
  iat: number;
  exp: number;
};

type CreateSessionInput = {
  adminId: string | number;
  email: string;
};

type VerifyPasswordInput = {
  plainPassword: string;
  passwordHash?: string | null;
  legacyPlainPassword?: string | null;
};

function getAdminSessionSecret() {
  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();

  if (!secret) {
    throw new Error('Falta ADMIN_SESSION_SECRET');
  }

  return secret;
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

function signValue(value: string) {
  return toBase64Url(
    crypto.createHmac('sha256', getAdminSessionSecret()).update(value).digest()
  );
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword({
  plainPassword,
  passwordHash,
  legacyPlainPassword,
}: VerifyPasswordInput) {
  if (passwordHash && passwordHash.startsWith('scrypt$')) {
    const parts = passwordHash.split('$');

    if (parts.length !== 3) {
      return false;
    }

    const salt = parts[1];
    const expected = parts[2];
    const actual = crypto.scryptSync(plainPassword, salt, 64).toString('hex');

    return safeEqual(actual, expected);
  }

  if (typeof legacyPlainPassword === 'string') {
    return plainPassword === legacyPlainPassword;
  }

  return false;
}

export function createAdminSessionToken(input: CreateSessionInput) {
  const now = Math.floor(Date.now() / 1000);

  const payload: AdminSession = {
    adminId: String(input.adminId),
    email: input.email,
    iat: now,
    exp: now + ADMIN_SESSION_TTL_SECONDS,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signValue(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionToken(token: string | undefined | null) {
  if (!token) return null;

  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signValue(encodedPayload);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      fromBase64Url(encodedPayload).toString('utf8')
    ) as AdminSession;

    if (!payload?.adminId || !payload?.email || !payload?.exp) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);

    if (payload.exp <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function attachAdminSessionCookie(
  response: NextResponse,
  input: CreateSessionInput
) {
  const token = createAdminSessionToken(input);

  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });

  return response;
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}

export function getAdminSessionFromRequest(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminSessionToken(token);
}

export function requireAdminAuth(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);

  if (!session) {
    console.log('ADMIN AUTH DEBUG', {
      hasAdminCookie: !!token,
      cookieNames: request.cookies.getAll().map((c) => c.name),
      tokenPreview: token ? `${token.slice(0, 24)}...` : null,
      secretPresent: !!(process.env.ADMIN_SESSION_SECRET || '').trim(),
    });

    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'No autorizado.' },
        { status: 401 }
      ),
    };
  }

  return {
    ok: true as const,
    session,
  };
}