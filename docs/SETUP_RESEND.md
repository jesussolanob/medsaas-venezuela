# Setup de notificaciones email — Resend

## ⏱ Tiempo total: 15 minutos

## 1. Crear cuenta en Resend (gratis)

1. Ve a https://resend.com → "Sign up"
2. Confirma tu email

**Plan free incluye**:
- 3,000 emails / mes
- 100 emails / día
- 1 dominio custom

## 2. Configurar dominio para enviar (recomendado, no obligatorio)

Sin dominio custom: Resend te deja enviar desde `onboarding@resend.dev` pero los emails caen en spam más fácil.

Con dominio custom (`hola@deltamedical.com`): mejor entregabilidad + branding.

### Pasos:

1. En Resend dashboard → **Domains** → "Add Domain"
2. Ingresa `deltamedical.com.ve` (o el que tengas)
3. Resend te muestra 3-4 DNS records (TXT, MX, CNAME)
4. Pégalos en tu DNS provider (Cloudflare/Vercel/donde tengas el dominio)
5. Click "Verify DNS records" — toma 5-15 min en propagar

**Importante**: SPF + DKIM + DMARC son obligatorios. Sin ellos los emails entran a spam.

## 3. Obtener API key

1. Resend dashboard → **API Keys** → "Create API Key"
2. Nombre: `Vercel Production`
3. Permisos: **Full access** (o **Sending access** si quieres restringir)
4. Click "Add" → copia el `re_xxx...`

⚠️ **Solo se muestra una vez**. Guárdalo en password manager.

## 4. Agregar variables en Vercel

Ve a Vercel dashboard → tu proyecto → **Settings** → **Environment Variables**.

Agrega 3 variables (Production, Preview, Development):

| Nombre | Valor | Notas |
|---|---|---|
| `RESEND_API_KEY` | `re_xxx...` | El que copiaste |
| `RESEND_FROM_EMAIL` | `Delta Medical CRM <hola@deltamedical.com.ve>` | Cambia por tu dominio si lo configuraste, o `onboarding@resend.dev` si no |
| `APP_URL` | `https://medsaas-venezuela.vercel.app` | O tu dominio final cuando lo conectes |
| `CRON_SECRET` | `<genera con openssl rand -hex 32>` | Para proteger el endpoint cron |

Para generar el `CRON_SECRET`:
```bash
openssl rand -hex 32
```

## 5. Re-deploy

Después de agregar las env vars, en Vercel: **Deployments** → último deployment → **Redeploy** (sin "use cache").

## 6. Verificar que funciona

Una vez deployed, prueba:

### Test 1: Welcome email
1. Ve a `https://medsaas-venezuela.vercel.app/register`
2. Crea una cuenta de prueba (con un email tuyo)
3. Revisa la bandeja — debería llegar el email "Bienvenido a Delta Medical CRM"

### Test 2: Expiration cron (manualmente)
```bash
curl -H "Authorization: Bearer TU_CRON_SECRET" \
  https://medsaas-venezuela.vercel.app/api/cron/subscription-expiry
```

Devuelve JSON con cuántos emails se enviaron por ventana (7d, 3d, 1d).

### Test 3: Auto-cron de Vercel
Vercel ejecuta `/api/cron/subscription-expiry` automáticamente todos los días a las **9:00 AM hora Venezuela** (13:00 UTC) según `vercel.json`.

Para verlo: Vercel dashboard → **Cron Jobs** → ahí aparece el job + historial de ejecuciones.

## 7. Templates ya incluidos

| Trigger | Template | Cuándo se envía |
|---|---|---|
| `sendWelcomeEmail` | Bienvenida | Al registrarse como doctor |
| `sendPaymentApprovedEmail` | Pago aprobado | Admin aprueba comprobante |
| `sendPaymentRejectedEmail` | Pago rechazado | Admin rechaza comprobante |
| `sendSubscriptionExpiringEmail` | Vence pronto | Cron diario, en ventanas 7/3/1 días |

Todos usan el mismo layout (`emailLayout` en `lib/email.ts`) — gradient teal, footer con info de soporte.

## 8. Personalizar layout

Editar `lib/email.ts` función `emailLayout()`:
- Logo (hoy es "Delta." text)
- Color del header (gradient `#06B6D4 → #0891b2`)
- Email de soporte en footer (`soporte@deltamedical.com`)

## 9. Si los emails no llegan

1. **Revisa spam** primero (especialmente sin dominio custom)
2. **Resend dashboard → Logs** muestra cada envío con status delivered/bounced/spam
3. **Vercel logs** muestra si el endpoint se está ejecutando: `vercel logs <project> --prod`
4. **DNS no propagó**: tarda hasta 24h en algunos casos

## 10. Sin RESEND_API_KEY = degradación silenciosa

Si la API key NO está configurada, `sendEmail()` loggea el intento con `console.warn` y retorna `{ ok: false }` sin tirar error. Los flujos (registro, aprobación de pago) siguen funcionando — solo no se envía el email.

Esto es intencional: durante desarrollo o si Resend está caído, la app no se rompe.
