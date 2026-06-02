# Plan Detallado — Fases 6 y 9: Performance y Observabilidad

> Referencia: `master-plan.md` Fases 6 y 9
> Prerrequisito: Fase 3 (backend operativo). Puede ejecutarse en paralelo con Fases 4-7.
> Entregable: Lighthouse ≥ 80, Sentry activo, GA4 configurado, sin N+1 queries evidentes

---

## Fase 6 — Performance

### 6.1 Code Splitting y Lazy Loading

Auditar el bundle antes de cualquier optimización:

```bash
cd apps/frontend
ANALYZE=true pnpm build
# Instalar si no está: pnpm add -D @next/bundle-analyzer
```

Aplicar `dynamic()` a componentes pesados:

```typescript
// Componentes que deben ser lazy
const AgendaCalendar = dynamic(() => import('@/components/agenda/AgendaCalendar'), {
  loading: () => <CalendarSkeleton />,
  ssr: false,  // el calendario es client-side
});

const FinanceCharts = dynamic(() => import('@/components/finances/FinanceCharts'), {
  loading: () => <ChartSkeleton />,
});

const NewDoctorModal = dynamic(() => import('@/components/admin/NewDoctorModal'), {
  loading: () => null,
});

const ConsultationBlockEditor = dynamic(
  () => import('@/components/consultations/ConsultationBlockEditor'),
  { loading: () => <EditorSkeleton /> },
);
```

Crear un componente `Skeleton` para cada uno de los anteriores. Los Skeletons deben tener las mismas dimensiones que el componente real para evitar CLS.

### 6.2 Imágenes

Reemplazar todos los `<img>` con `<Image>` de Next.js:

```typescript
import Image from 'next/image';

// Hero / avatar principal: eager + high priority
<Image src={avatarUrl} alt={name} width={80} height={80} priority fetchpriority="high" />

// Resto: lazy
<Image src={logoUrl} alt={clinicName} width={120} height={40} loading="lazy" />
```

`next.config.ts`:

```typescript
const nextConfig = {
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'storage.googleapis.com', pathname: '/delta-medical-public-assets/**' },
    ],
  },
};
```

### 6.3 Índices PostgreSQL críticos

Agregar en una migration `002-performance-indexes.ts`:

```sql
-- Agenda: consultas frecuentes por doctor y fecha
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date
  ON appointments (doctor_id, scheduled_at);

-- Pacientes: listado por doctor
CREATE INDEX IF NOT EXISTS idx_patients_doctor
  ON patients (doctor_id);

-- Búsqueda por cédula (hash determinístico)
CREATE INDEX IF NOT EXISTS idx_patients_cedula_hash
  ON patients (cedula_search_hash);

-- Búsqueda por nombre (hash determinístico)
CREATE INDEX IF NOT EXISTS idx_patients_name_hash
  ON patients (full_name_search_hash);

-- Consultas por doctor y fecha
CREATE INDEX IF NOT EXISTS idx_consultations_doctor_date
  ON consultations (doctor_id, consultation_date);

-- Verificación rápida de suscripción activa
CREATE INDEX IF NOT EXISTS idx_subscriptions_doctor_status
  ON subscriptions (doctor_id, status);

-- Paquetes activos de paciente
CREATE INDEX IF NOT EXISTS idx_packages_patient_status
  ON patient_packages (patient_id, status);

-- Audit log por usuario y fecha (para consultas de admin)
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_date
  ON access_audit_log (actor_id, created_at DESC);
```

### 6.4 Cache-Control headers para datos sensibles

En NestJS, interceptor para respuestas con datos de pacientes:

```typescript
// apps/backend/src/presentation/interceptors/no-cache.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { tap } from 'rxjs/operators';

@Injectable()
export class NoCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const response = context.switchToHttp().getResponse();
    return next.handle().pipe(
      tap(() => {
        response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        response.setHeader('Pragma', 'no-cache');
      }),
    );
  }
}
```

Aplicar a todos los controllers que devuelven datos de pacientes:

```typescript
@UseInterceptors(NoCacheInterceptor)
@Controller('api/patients')
export class PatientsController { ... }
```

### 6.5 Caché Redis por ruta (TTLs)

| Dato | TTL | Invalidación |
|------|-----|--------------|
| Configuración de planes | 3600s | Al actualizar plan en admin |
| Feature flags por plan | 3600s | Al cambiar feature flags |
| Perfil del doctor | 900s | Al actualizar settings |
| Tasa USDT/Binance | 600s | Manual desde admin |
| Slots de disponibilidad | 120s | Al crear/cancelar cita |
| Dashboard KPIs admin | 300s | Al cambiar suscripción |

### 6.6 Core Web Vitals — targets

| Métrica | Target | Cómo lograrlo |
|---------|--------|---------------|
| LCP | < 2.5s | Preload de font + avatar del doctor con `priority` |
| INP | < 200ms | Evitar re-renders innecesarios, lazy loading |
| CLS | < 0.1 | Dimensiones explícitas en todas las imágenes, Skeletons |
| FCP | < 1.5s | CSS crítico inline, no render-blocking |
| TBT | < 200ms | Code splitting, no long tasks en el main thread |

---

## Fase 9 — Observabilidad

### 9.1 Sentry — Backend (NestJS)

```bash
pnpm add @sentry/nestjs @sentry/profiling-node
```

`apps/backend/src/main.ts`:

```typescript
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: 0.1,
  integrations: [nodeProfilingIntegration()],
  beforeSend(event) {
    // Redactar campos sensibles antes de enviar a Sentry
    const sensitiveFields = ['cedula', 'diagnosis', 'treatment', 'medication_name', 'phone', 'email'];
    if (event.request?.data) {
      for (const field of sensitiveFields) {
        if (event.request.data[field]) {
          event.request.data[field] = '[REDACTED]';
        }
      }
    }
    return event;
  },
});

// Inicializar ANTES del bootstrap de NestJS
const app = await NestFactory.create(AppModule);
```

En `GlobalExceptionFilter`, agregar captura de Sentry:

```typescript
} else {
  Sentry.captureException(exception);
  this.logger.error('Unhandled exception', ...);
}
```

### 9.2 Sentry — Frontend (Next.js)

```bash
npx @sentry/wizard@latest -i nextjs
```

El wizard crea automáticamente `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`.

Configuración en `sentry.client.config.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 0.5,
  tunnel: '/api/sentry-tunnel',  // evitar adblockers
  beforeSend(event) {
    const sensitiveFields = ['cedula', 'diagnosis', 'treatment', 'phone'];
    if (event.request?.data) {
      for (const field of sensitiveFields) {
        if (event.request.data[field]) event.request.data[field] = '[REDACTED]';
      }
    }
    return event;
  },
});
```

Crear `app/api/sentry-tunnel/route.ts` (el wizard lo genera automáticamente).

Envolver la app con `ErrorBoundary` en el layout raíz:

```tsx
import * as Sentry from '@sentry/nextjs';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Sentry.ErrorBoundary fallback={<ErrorPage />}>
          {children}
        </Sentry.ErrorBoundary>
      </body>
    </html>
  );
}
```

### 9.3 Google Analytics 4

```bash
pnpm add @next/third-parties
```

`app/layout.tsx`:

```tsx
import { GoogleAnalytics } from '@next/third-parties/google';

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
      {process.env.NEXT_PUBLIC_ENV === 'production' && (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA4_ID!} />
      )}
    </html>
  );
}
```

Eventos personalizados a instrumentar:

```typescript
// lib/analytics.ts
declare const gtag: Function;

export const trackEvent = (eventName: string, params?: Record<string, unknown>): void => {
  if (typeof window !== 'undefined' && typeof gtag !== 'undefined') {
    gtag('event', eventName, params);
  }
};

// Uso en componentes:
trackEvent('booking_started', { doctor_id: doctorId });
trackEvent('booking_completed', { doctor_id: doctorId, plan_name: planName });
trackEvent('booking_abandoned', { step: currentStep });
trackEvent('doctor_registered', { plan: selectedPlan });
```

### 9.4 Alertas en Sentry

Configurar en Sentry dashboard:
- Alert: Error rate > 1% en producción → notificar por email
- Alert: New issue detected → notificar por email
- Alert: Regression detected → notificar por email
- Alert: Performance degradation (p95 > 2s) → notificar por email

---

## Verificación ✓

```bash
# Lighthouse en páginas principales
npx lighthouse https://tudominio.com --output=json --quiet | jq '.categories.performance.score'
# → debe ser >= 0.80

# Verificar que no hay N+1 queries (revisar logs de Sequelize en dev)
# Buscar patrones donde se hace SELECT dentro de un loop

# Verificar Sentry recibe eventos
# En Sentry dashboard: Issues → debe aparecer al menos el evento de prueba

# Verificar GA4 recibe eventos
# En GA4 → DebugView → disparar un evento de booking y verificar que aparece
```

**Criterios de aceptación:**
- [ ] Lighthouse Performance ≥ 80 en `/`, `/doctor`, `/book/[id]`
- [ ] No hay N+1 queries evidentes en los logs
- [ ] Sentry activo en frontend y backend con datos sensibles redactados
- [ ] GA4 recibe eventos de booking y registro
- [ ] Campos sensibles con `Cache-Control: no-store` en headers
- [ ] Bundle principal < 200KB gzipped
