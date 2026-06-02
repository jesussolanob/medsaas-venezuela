# Plan Detallado — Fase 4: Seguridad e Identidad

> **⚠️ ETAPA 2 — Abrir este archivo solo cuando todos los módulos de `modulos/` estén implementados y probados localmente.**
> El producto debe funcionar completo antes de configurar Auth0, Cloudflare y GCP Secret Manager.

> Referencia: `master-plan.md` Fase 4
> Prerrequisito: todos los módulos de `modulos/` completados con cobertura ≥ 80%
> Entregable: Auth0 BFF activo, token nunca en browser, encriptación por IAM en prod, Cloudflare configurado, sesión única por usuario

---

## Resumen del modelo de seguridad

```
[Browser] ──HTTPS──▶ [Cloudflare WAF] ──▶ [Next.js Cloud Run — frontend]
                                                    │
                                         httpOnly cookie (JWT cifrado, JS no puede leerlo)
                                                    │
                                           Server Action / Route Handler
                                                    │
                                        Authorization: Bearer <token>  (VPC interna)
                                                    │
                                         [NestJS Cloud Run — backend, ingress=internal]
                                                    │
                                              [Cloud SQL — ciphertext]
```

---

## Paso 1 — Configurar tenant Auth0

1. Crear cuenta en [auth0.com](https://auth0.com)
2. Crear tenant: `delta-medical` (región: US East si es la más cercana disponible)
3. En **Applications → Create Application**:
   - Nombre: `Delta Medical Web`
   - Tipo: **Regular Web Application** (NO SPA — crítico para el flujo httpOnly cookie)
4. En **APIs → Create API**:
   - Name: `Delta Medical API`
   - Identifier: `https://api.deltamedical.com`
   - Signing Algorithm: RS256
5. En **Authentication → Passwordless**:
   - Habilitar **Email** con tipo **Magic Link**
6. En **Applications → Delta Medical Web → Settings**:
   - Allowed Callback URLs: `http://localhost:3000/api/auth/callback, https://tudominio.com/api/auth/callback`
   - Allowed Logout URLs: `http://localhost:3000, https://tudominio.com`
   - Allowed Web Origins: `http://localhost:3000, https://tudominio.com`
7. En **Applications → Delta Medical Web → Advanced Settings → OAuth**:
   - Token Endpoint Auth Method: `Post`
   - JSON Web Token Signature Algorithm: `RS256`

**Configuración de tokens (en tenant settings):**

```
Access Token Expiration:   900 segundos (15 min)
Refresh Token Rotation:    HABILITADO
Reuse Interval:            0 segundos (rotación inmediata)
Absolute Expiration:       HABILITADO → 2592000 segundos (30 días)
Inactivity Expiration:     HABILITADO → 1296000 segundos (15 días)
```

**Importante — Refresh Token Reuse Detection:**
En Applications → Delta Medical Web → Settings → Refresh Token Rotation:
- Enable Rotation: ON
- Enable Absolute Expiration: ON
- Enable Inactivity Expiration: ON

Si se detecta reutilización de un refresh token ya rotado → Auth0 revoca TODA la familia de tokens automáticamente.

---

## Paso 2 — Action: custom claims + registro de sesión

En Auth0 → **Actions → Flows → Login → Add action (Custom)**:

```javascript
// Action: inject-role-and-register-session
exports.onExecutePostLogin = async (event, api) => {
  // 1. Inyectar el rol en el access token
  const namespace = 'https://deltamedical.com';
  const role = event.user.app_metadata?.role ?? 'doctor';
  api.accessToken.setCustomClaim(`${namespace}/role`, role);
  api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);

  // 2. Registrar sesión activa en el backend (para single-device enforcement)
  try {
    await fetch(`${event.secrets.BACKEND_INTERNAL_URL}/api/auth/register-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-action-secret': event.secrets.ACTION_SECRET,
      },
      body: JSON.stringify({
        userId: event.user.user_id,
        sessionId: event.transaction.id,
        ip: event.request.ip,
        userAgent: event.request.user_agent,
      }),
    });
  } catch (e) {
    // No bloquear el login si el backend no responde — solo loguear
    console.error('register-session failed', e.message);
  }
};
```

Secrets requeridos en la Action:
- `BACKEND_INTERNAL_URL`: URL del backend (en dev: ngrok URL o tunnel; en prod: URL interna Cloud Run)
- `ACTION_SECRET`: secreto compartido para validar que el request viene de Auth0

---

## Paso 3 — Integrar @auth0/nextjs-auth0 en el frontend

```bash
pnpm add @auth0/nextjs-auth0
```

`apps/frontend/auth0.config.ts`:

```typescript
import { initAuth0 } from '@auth0/nextjs-auth0';

export const auth0 = initAuth0({
  secret: process.env.AUTH0_SECRET!,
  baseURL: process.env.AUTH0_BASE_URL!,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL!,
  clientID: process.env.AUTH0_CLIENT_ID!,
  clientSecret: process.env.AUTH0_CLIENT_SECRET!,
  authorizationParams: {
    response_type: 'code',
    audience: 'https://api.deltamedical.com',
    scope: 'openid profile email offline_access',
  },
  session: {
    rolling: true,
    rollingDuration: 1800,      // 30 min inactividad
    absoluteDuration: 86400,    // 24h máximo absoluto
    cookie: {
      httpOnly: true,           // JavaScript NO puede leer esta cookie
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    },
  },
  routes: {
    callback: '/api/auth/callback',
    login: '/api/auth/login',
    logout: '/api/auth/logout',
  },
});
```

`apps/frontend/app/api/auth/[auth0]/route.ts`:

```typescript
import { auth0 } from '../../../../auth0.config';
export const GET = auth0.handleAuth();
```

`apps/frontend/middleware.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from './auth0.config';

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const res = NextResponse.next();

  // Rutas públicas — no requieren autenticación
  const publicPaths = ['/login', '/register', '/book/', '/api/auth/', '/api/settings/usdt-rate'];
  if (publicPaths.some(path => req.nextUrl.pathname.startsWith(path))) {
    return res;
  }

  // Verificar sesión — si no hay sesión, redirigir al login
  const session = await auth0.getSession(req, res);
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Redirigir según rol si intenta acceder a ruta de otro rol
  const role = session.user['https://deltamedical.com/role'];
  const path = req.nextUrl.pathname;

  if (path.startsWith('/admin') && role !== 'super_admin') {
    return NextResponse.redirect(new URL(`/${role}`, req.url));
  }
  if (path.startsWith('/doctor') && role !== 'doctor') {
    return NextResponse.redirect(new URL(`/${role}`, req.url));
  }
  if (path.startsWith('/patient') && role !== 'patient') {
    return NextResponse.redirect(new URL(`/${role}`, req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

`apps/frontend/src/lib/api-client.server.ts`:

```typescript
import { auth0 } from '../../../auth0.config';

// Este archivo solo puede importarse en Server Components, Server Actions, o Route Handlers.
// Si se importa en un Client Component, Next.js lanzará un error de build.

export async function serverFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const session = await auth0.getSession();

  if (!session?.accessToken) {
    throw new Error('No active session');
  }

  const response = await fetch(`${process.env.BACKEND_INTERNAL_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      ...options.headers,
    },
  });

  // Si el backend responde SESSION_SUPERSEDED, forzar logout
  if (response.status === 401) {
    const body = await response.clone().json().catch(() => ({}));
    if (body?.code === 'SESSION_SUPERSEDED') {
      throw new Error('SESSION_SUPERSEDED');
    }
  }

  return response;
}
```

En cada Server Action, manejar `SESSION_SUPERSEDED`:

```typescript
'use server';
import { redirect } from 'next/navigation';
import { serverFetch } from '@/lib/api-client.server';

export async function getAppointments() {
  try {
    const res = await serverFetch('/api/appointments');
    return res.json();
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_SUPERSEDED') {
      redirect('/api/auth/logout?returnTo=/login?reason=session_superseded');
    }
    throw error;
  }
}
```

---

## Paso 4 — Integrar Auth0 en NestJS (producción)

```bash
pnpm add passport passport-jwt @nestjs/passport jwks-rsa
pnpm add -D @types/passport-jwt
```

`apps/backend/src/infrastructure/auth/jwt.strategy.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ['RS256'],
    });
  }

  validate(payload: Record<string, unknown>): unknown {
    return {
      sub: payload.sub,
      role: payload['https://deltamedical.com/role'],
      email: payload['https://deltamedical.com/email'],
    };
  }
}
```

`apps/backend/src/presentation/guards/auth.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

**Alternancia dev/prod:** en `AppModule`, registrar el guard según el entorno:

```typescript
{
  provide: APP_GUARD,
  useClass: process.env.NODE_ENV === 'production' ? JwtAuthGuard : DevAuthGuard,
}
```

---

## Paso 5 — Single device enforcement en NestJS

`apps/backend/src/presentation/controllers/auth.controller.ts`:

```typescript
@Controller('api/auth')
export class AuthController {
  constructor(private readonly redis: RedisService) {}

  @Post('register-session')
  async registerSession(@Headers('x-action-secret') secret: string, @Body() body: RegisterSessionDto): Promise<void> {
    if (secret !== process.env.AUTH0_ACTION_SECRET) {
      throw new UnauthorizedException();
    }
    const key = `active_session:${body.userId}`;
    await this.redis.set(key, JSON.stringify({
      sessionId: body.sessionId,
      ip: body.ip,
      userAgent: body.userAgent,
      loginAt: new Date().toISOString(),
    }), 86400); // TTL = 24h (igual al absoluteDuration de la sesión Auth0)
  }
}
```

`apps/backend/src/presentation/guards/active-session.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ActiveSessionGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.sub) return false;

    const stored = await this.redis.get(`active_session:${user.sub}`);
    if (!stored) return true; // primera vez — dejar pasar

    const { sessionId } = JSON.parse(stored);

    // jti (JWT ID) del token actual — Auth0 lo incluye como claim
    const currentJti = request.user.jti;
    if (currentJti && sessionId !== currentJti) {
      throw new UnauthorizedException({ code: 'SESSION_SUPERSEDED', message: 'Session started on another device' });
    }

    return true;
  }
}
```

---

## Paso 6 — Encriptación por IAM (solo producción)

`apps/backend/src/infrastructure/config/encryption-key.service.ts`:

```typescript
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

@Injectable()
export class EncryptionKeyService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionKeyService.name);
  private encryptionKey!: Buffer;
  private hmacSecret!: string;

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      // En desarrollo: usar variables de entorno
      this.encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
      this.hmacSecret = process.env.ENCRYPTION_HMAC_SECRET!;
      this.logger.warn('Using local encryption keys — development mode only');
      return;
    }

    // En producción: obtener desde Secret Manager via IAM
    const client = new SecretManagerServiceClient();
    const projectId = process.env.GCP_PROJECT_ID!;

    const [keyVersion] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/FIELD_ENCRYPTION_KEY/versions/latest`,
    });
    const [hmacVersion] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/FIELD_ENCRYPTION_HMAC_SECRET/versions/latest`,
    });

    this.encryptionKey = Buffer.from(keyVersion.payload!.data!.toString(), 'hex');
    this.hmacSecret = hmacVersion.payload!.data!.toString();
    this.logger.log('Encryption keys loaded from Secret Manager via IAM');
  }

  getKey(): Buffer { return this.encryptionKey; }
  getHmacSecret(): string { return this.hmacSecret; }
}
```

`libs/shared-crypto/src/field-encryption.ts`:

```typescript
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, encrypted, authTag].map(b => b.toString('base64')).join(':');
}

export function decrypt(encoded: string, key: Buffer): string {
  const parts = encoded.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const [ivB64, ciphertextB64, authTagB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

export function hashForSearch(value: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(value.toLowerCase().trim())
    .digest('hex');
}

export function maskCedula(cedula: string): string {
  if (cedula.length <= 5) return '***';
  return cedula.slice(0, 3) + '*'.repeat(cedula.length - 5) + cedula.slice(-2);
}

export function maskName(name: string): string {
  const parts = name.trim().split(' ');
  return parts[0] + (parts.length > 1 ? ' ' + parts[parts.length - 1][0] + '.' : '');
}

export function maskPhone(phone: string): string {
  if (phone.length <= 6) return '***';
  return phone.slice(0, 4) + '*'.repeat(phone.length - 7) + phone.slice(-3);
}
```

---

## Paso 7 — Cloudflare (configuración paso a paso)

### 7.1 DNS y proxy

1. Agregar el dominio en Cloudflare → DNS → agregar registro A/CNAME apuntando a la IP del Cloud Run frontend
2. Nube naranja (proxy) habilitada
3. SSL/TLS → Overview → modo **Full (Strict)**
4. SSL/TLS → Edge Certificates → habilitar **Always Use HTTPS** y **HSTS**

### 7.2 WAF Managed Rules

Security → WAF → Managed Rules:
- Activar **Cloudflare Managed Ruleset** → Deploy
- Activar **Cloudflare OWASP Core Ruleset** → Deploy, Sensitivity: Medium
- Si hay falsos positivos → ajustar a Low o crear excepciones puntuales

### 7.3 Bot Fight Mode

Security → Bots → **Bot Fight Mode: ON**

### 7.4 Security Headers (Transform Rules)

Rules → Transform Rules → Modify Response Header → Create Rule:
- Rule name: `Security Headers`
- When: All requests (no filtro)
- Then set headers:

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

### 7.5 Turnstile (anti-bot en formularios)

1. Cloudflare Dashboard → Turnstile → Add Site
2. Dominio: tu dominio, tipo: **Invisible** (no interrumpe UX)
3. Copiar Site Key (pública) y Secret Key (privada)

En el frontend, instalar:
```bash
pnpm add @marsidev/react-turnstile
```

En los formularios `/register` y `/book/[doctorId]`:

```tsx
// Client Component
import { Turnstile } from '@marsidev/react-turnstile';

<Turnstile
  siteKey={process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY!}
  onSuccess={(token) => setTurnstileToken(token)}
/>
```

En el Server Action que procesa el formulario:

```typescript
async function verifyTurnstile(token: string): Promise<boolean> {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY, response: token }),
  });
  const data = await res.json();
  return data.success === true;
}
```

### 7.6 Rate Limiting básico (WAF Custom Rules)

Rules → WAF → Custom Rules → Create Rule:

**Regla 1 — Proteger login:**
- Expression: `(http.request.uri.path eq "/api/auth/login")`
- Action: Rate Limit → Requests: 10 / Period: 60s / Action: Block

**Regla 2 — Proteger booking:**
- Expression: `(http.request.uri.path wildcard "/book/*")`
- Action: Rate Limit → Requests: 30 / Period: 60s / Action: JS Challenge

---

## Verificación de Fase 4 ✓

```bash
# En producción — verificar que el JWT nunca llega al browser
# Abrir DevTools → Application → Cookies
# La cookie de sesión debe tener: HttpOnly ✓, Secure ✓, SameSite: Strict ✓

# Abrir DevTools → Network → cualquier request a /api/*
# No debe haber ningún header Authorization visible en requests del browser

# Verificar que NestJS rechaza requests externos
curl https://backend-url.run.app/api/health
# → Connection refused (el backend no responde desde internet)

# Verificar sesión única
# 1. Hacer login en Chrome
# 2. Hacer login en Firefox
# 3. Intentar hacer cualquier acción en Chrome
# → Debe redirigir a login con mensaje "Tu sesión fue iniciada en otro dispositivo"
```

**Criterios de aceptación:**
- [ ] Magic link funciona end-to-end
- [ ] `document.cookie` en browser no expone el JWT
- [ ] Network tab no muestra `Authorization: Bearer` en requests del browser
- [ ] NestJS no responde desde internet público
- [ ] Segunda sesión invalida la primera con mensaje claro
- [ ] Cloudflare dashboard muestra el dominio con WAF activo
- [ ] Turnstile aparece en `/register` y `/book/[doctorId]`
- [ ] `patients.cedula` en la BD muestra ciphertext, no texto plano
