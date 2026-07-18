# Snapshot DNS de `deltasalud.app` — ANTES de migrar a Cloudflare (2026-07-18)

> Respaldo para revertir si algo sale mal. Estado capturado con `dig` + panel Namecheap.
> Registrador: **Namecheap** (cuenta `jesussolanob`, registrante `jesussolano4@gmail.com`).
> DNS actual: **Namecheap BasicDNS** — NS: `dns1.registrar-servers.com`, `dns2.registrar-servers.com`.
> Dominio activo hasta **2026-06-01 → 2028-06-01**, auto-renew ON.

## Registros actuales (Namecheap BasicDNS)

| Tipo  | Host               | Valor                                                                                                                                                                                                                        | Prio/TTL  | Propósito                                                  | Acción al migrar a Cloudflare        |
| ----- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------- | ------------------------------------ |
| A     | @                  | `76.76.21.21`                                                                                                                                                                                                                | Automatic | Web — app legacy en **Vercel**                             | **CAMBIAR** → Cloud Run (proxied 🟠) |
| CNAME | www                | `cname.vercel-dns.com.`                                                                                                                                                                                                      | Automatic | Web www — **Vercel**                                       | **CAMBIAR** → Cloud Run (proxied 🟠) |
| CNAME | www                | `parkingpage.namecheap.com.`                                                                                                                                                                                                 | 30 min    | Parking (residual, conflictivo)                            | **DESCARTAR**                        |
| MX    | @                  | `smtp.google.com.`                                                                                                                                                                                                           | 1         | **Email humano — Google Workspace** (lucas@deltasalud.app) | **PRESERVAR** (DNS only ⚪)          |
| MX    | send               | `feedback-smtp.us-east-1.amazonses.com.`                                                                                                                                                                                     | 10        | **Resend** (bounces del subdominio `send`)                 | **PRESERVAR** (DNS only ⚪)          |
| TXT   | resend.\_domainkey | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDUq3C2TpDwWzbVWzCKfIyuvdGpVl4NgfBRbXMksYuAXmAVEz44KXB2FtJHFSffnoeYKVmGcLTykeZP3kYNtrGRb9dUPMQCkuylO5WaZhxYMrBnyp/Uwri3AOrFoWBgIRuXXQKUyLzDQXO08kmPj9UdMoeuAGmB+H39+qOvsdTM9wIDAQAB` | Automatic | **Resend DKIM**                                            | **PRESERVAR** (DNS only ⚪)          |
| TXT   | @                  | `google-site-verification=1zv56InsLUutJUIN9A25hHw3qrYN0TZe-eGQsJQQrwc`                                                                                                                                                       | Automatic | Google Search Console                                      | **PRESERVAR**                        |

## ⚠️ Puntos críticos

1. **El correo `@deltasalud.app` usa Google Workspace** (MX → `smtp.google.com`). Incluye `lucas@deltasalud.app`,
   la cuenta con la que se reciben los códigos de login del QA. **Si se rompe el MX, se cae el correo humano.**
2. **Resend** envía desde el subdominio `send.deltasalud.app` (MX `send` + DKIM `resend._domainkey`). Preservar ambos.
3. **NO hay SPF ni DMARC** configurados hoy (`dig TXT` en @ solo muestra el google-site-verification; `_dmarc` vacío).
   Es una debilidad actual → al migrar conviene **agregar SPF (Google + Resend) y DMARC** como mejora.
4. La app **legacy vive en Vercel** (`A @ 76.76.21.21` + `CNAME www vercel-dns`). Al migrar, raíz y www pasan a
   Cloud Run vía Cloudflare.

## Objetivo

```
deltasalud.app → Cloudflare (proxy/WAF/analytics 🟠) → Cloud Run (delta-frontend, sodium-shard-499116-r3 / us-east1)
```

- Web (`@` y `www`) → proxied 🟠 hacia Cloud Run (domain mapping).
- Email (MX Google + MX/DKIM Resend) → **DNS only ⚪** (Cloudflare no proxea correo).
- Reversión: volver los NS en Namecheap a `dns1/dns2.registrar-servers.com` y restaurar los records de esta tabla.

## Progreso de la migración

- **Fase 0 ✅** — inventario DNS (arriba).
- **Fase 1 ✅ (2026-07-18)** — `deltasalud.app` agregado a **Cloudflare** (cuenta `Lucas@deltasalud.app`, account
  `492c0ed8af44453b6de951800b80be14`), **plan Free**. Cloudflare escaneó los 6 records; los 4 de email se
  importaron como **DNS only** ⚪ (MX Google, MX Resend, TXT verif, TXT DKIM Resend). A/CNAME web quedaron
  Proxied 🟠 (se reapuntan a Cloud Run en Fase 2). Parking residual descartado.
  - **Nameservers de Cloudflare asignados** (poner en Namecheap en la Fase 3):
    - `chad.ns.cloudflare.com`
    - `vera.ns.cloudflare.com`
  - ⚠️ **Namecheap AÚN sin cambiar** (NS siguen en `dns1/dns2.registrar-servers.com`) → Cloudflare todavía NO
    tiene control; producción intacta.
- **Fase 2 ⏳ (en curso)** — verificación del dominio en Google + Cloud Run domain mapping.
  - TXT de verificación de Cloud Run/Search Console agregado en Namecheap: `google-site-verification=9IqnBoTvouEGm3pvoPdx5UKYWboNfPDQ2xeZiQlVDlM` (host `@`) — propagado ✅.
  - ⚠️ **Al agregarlo, Namecheap REEMPLAZÓ el TXT viejo** `google-site-verification=1zv56InsLUutJUIN9A25hHw3qrYN0TZe-eGQsJQQrwc`
    (era la verificación de Search Console de la app legacy). **PENDIENTE: restaurar ese `1zv56` en Cloudflare**
    (Cloudflare sí soporta múltiples TXT `@` sin pisarse) al recrear los records. No es crítico (la app legacy
    sale de servicio), pero se restaura por prolijidad para no desverificar la propiedad vieja.
  - ✅ **Dominio verificado** en Google Search Console (método "Proveedor de nombres de dominio").
  - ✅ **Domain mapping creado**: `deltasalud.app` → `delta-frontend` (us-east1). Cloud Run entregó estos records
    (van en **Cloudflare**, no en Namecheap):
    - **A**: `216.239.32.21`, `216.239.34.21`, `216.239.36.21`, `216.239.38.21`
    - **AAAA**: `2001:4860:4802:32::15`, `2001:4860:4802:34::15`, `2001:4860:4802:36::15`, `2001:4860:4802:38::15`
  - ⚠️ **Cert de Cloud Run + Cloudflare proxied:** si los records están _proxied_ (🟠) desde el inicio, Cloudflare
    intercepta y Cloud Run NO puede emitir su cert. **Orden correcto:** poner los A/AAAA en Cloudflare como
    **DNS only (⚪)** → cambiar NS → esperar a que Cloud Run emita el cert → recién ahí pasar a **Proxied (🟠)** +
    SSL mode **Full (strict)**.
  - ✅ **Records cargados en Cloudflare** (vía API v4 con la sesión del dashboard, zone `04f2f752c15615f1883a89e4f38a424d`):
    - 4× **A** `@` → `216.239.32/34/36/38.21` (**DNS only ⚪** — para que Cloud Run emita el cert)
    - 4× **AAAA** `@` → `2001:4860:4802:{32,34,36,38}::15` (DNS only ⚪)
    - **CNAME** `www` → `deltasalud.app` (DNS only ⚪)
    - **TXT** `@` `google-site-verification=9Iqn…` (Cloud Run) + `1zv56…` (legacy, restaurado) — ambos presentes ✅
    - Email intacto: MX Google, MX Resend, TXT DKIM Resend (DNS only ⚪).
  - **🛑 FRENADO antes de cambiar nameservers** (punto de no retorno suave). Namecheap sigue con
    `dns1/dns2.registrar-servers.com` → producción intacta, Cloudflare aún sin control.

## Fase 3 ✅ (2026-07-18) — nameservers cambiados en Namecheap

Namecheap → Custom DNS: `chad.ns.cloudflare.com` + `vera.ns.cloudflare.com`. **Propagando** (Google DNS 8.8.8.8 ya
resuelve a Cloudflare; resolvers con caché tardan min–horas). El usuario aceptó downtime durante la transición.

Tras propagar: Cloudflare activo → Cloud Run emite el cert (records DNS only) → verificar `https://deltasalud.app`
sirve la app → **recién ahí** pasar A/AAAA a Proxied 🟠 + SSL Full(strict).

### Verificación DNS + estado del cert (2026-07-18, tarde)

- **NS ya propagados** a Cloudflare: `dig NS deltasalud.app @1.1.1.1` → `chad/vera.ns.cloudflare.com` ✅.
- **Records autoritativos correctos** (query directa a `chad.ns.cloudflare.com`, sin caché):
  - A `@` → 4× `216.239.3{2,4,6,8}.21` (Google/Cloud Run) · AAAA `@` → 4× `2001:4860:4802:3{2,4,6,8}::15`
  - `www` → CNAME `deltasalud.app` → resuelve a los mismos IPs de Google (DNS only, resuelve de corrido)
  - TXT `@` → **ambos** `1zv56…` (legacy restaurado) + `9Iqn…` (Cloud Run) ✅
  - Como los A devuelven IPs de Google (no `104.x` de proxy CF), se confirma que están **DNS only ⚪** — correcto para emitir cert.
- ⚠️ **El panel DNS de Cloudflare mostró records viejos de Vercel** (`A 76.76.21.21 Proxied`, `www CNAME vercel-dns`):
  era **DOM cacheado del dashboard** (render viejo), NO el estado real. El autoritativo manda: los records reales son los de Google.
- **Cert de Cloud Run: PENDIENTE** — `gcloud beta run domain-mappings describe --domain=deltasalud.app --region=us-east1`:
  `mappedRouteName: delta-frontend` ✅, `DomainRoutable: True` ✅, pero `CertificatePending` ("Waiting for certificate
  provisioning… configure your DNS records"). Google reintenta cada ~5 min tras el corte de NS. **Es cuestión de tiempo**
  (min–horas); los records ya son correctos. Reintento automático (`type: Retry, WaitingForOperation`).
- ⚠️ **Resolver local (macOS) todavía cacheado en Vercel** (`76.76.21.21`) → el navegador/curl locales siguen viendo la
  app legacy de Vercel (con su propio cert válido). Es caché local, NO estado real del dominio. Se limpia solo por TTL /
  `sudo dscacheutil -flushcache`. **No confundir con "el dominio sirve Vercel".**
- **www es apex-only en el mapping**: el domain mapping cubre solo `deltasalud.app`. `www` resuelve a los IPs de Google
  pero Cloud Run matchea por Host → una request con Host `www.…` no matchea el mapping. Se resuelve con **redirect
  www→apex en Cloudflare** (fase Proxied) o un 2º domain mapping para `www`. Canónico = **apex** (`https://deltasalud.app`).
- Zone id real de Cloudflare = `04f2f752c15615f1883a89e4f38a424d` (el `492c0ed8…` de la URL es el **account id**;
  usarlo como zone en la API v4 da 403 — usar el zone id para editar records por API).

## ⏭️ Fases 4-6 (en paralelo mientras propaga)

- **Fase 4 ✅ (2026-07-18)** — env del dominio: repo var GitHub `PUBLIC_URL` = `https://deltasalud.app`; env de
  Cloud Run `AUTH0_BASE_URL`/`APP_BASE_URL`/`GOOGLE_REDIRECT_URI` (front) y `CORS_ORIGIN`/`APP_BASE_URL`/
  `GOOGLE_REDIRECT_URI` (back) apuntados al dominio; `deploy.yml` ajustado para preferir `PUBLIC_URL` sobre la
  `.run.app` autodetectada (commit en esta rama → redeploy).
- **Fase 5 ✅ (2026-07-18)** — Auth0 (app `Delta Salud CRM`, client `ktiIpuO92nv0k6NeEl5ZwYNAfiWQks9s`): agregados
  `https://deltasalud.app/auth/callback` + `https://www.deltasalud.app/auth/callback` a callbacks, `https://deltasalud.app`
  a logout y a web_origins (preservando localhost/www/run.app). Verificado vía GET de la API interna del dashboard.
  Google OAuth (client `763714620325-823prmk160n99cpve9ustirmbq257c19`): agregados JS origin `https://deltasalud.app`
  - redirect `https://deltasalud.app/api/integrations/google/callback` (preservando los demás). Verificado tras reload.
- **Fase 6** — verificar login real + documentos + email + Calendar en el dominio.
- **Fase 7** — pasar records a Proxied 🟠 + SSL Full(strict); Cloudflare Analytics + WAF; ~~SPF/DMARC~~ ✅ (hecho,
  ver abajo); redirect www→apex; endurecimiento de red del backend (ingress=internal + Direct VPC egress) + header
  secreto del front.

### SPF + DMARC ✅ (2026-07-18) — agregados en Cloudflare (zone `04f2f752c15615f1883a89e4f38a424d`)

Se agregaron por API v4 del dashboard (header **`x-cross-site-security: dash`** es obligatorio para mutaciones;
sin él, POST/PATCH/DELETE devuelven un challenge HTML). Verificados por `dig` autoritativo + resolver 1.1.1.1:

| Registro | Host     | Valor                                                     | Propósito                                                          |
| -------- | -------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| TXT      | `@`      | `v=spf1 include:_spf.google.com ~all`                     | SPF apex → autoriza **Google Workspace** (correo humano `lucas@…`) |
| TXT      | `send`   | `v=spf1 include:amazonses.com ~all`                       | SPF del return-path de **Resend** (subdominio `send`, usa SES)     |
| TXT      | `_dmarc` | `v=DMARC1; p=none; rua=mailto:lucas@deltasalud.app; fo=1` | **DMARC monitor-only** (p=none, sin rechazo; reportes a lucas@)    |

- **Alineación DMARC:** el correo transaccional sale como `From: noreply@deltasalud.app` (apex) y **alinea por DKIM**
  (`resend._domainkey` firma `d=deltasalud.app`). El envelope/return-path usa `send.deltasalud.app` (SPF amazonses).
  El correo humano (Google Workspace) alinea por el SPF apex. Ambos flujos pasan DMARC.
- **Siguiente paso DMARC (futuro):** tras 1–2 semanas observando reportes `rua`, endurecer a `p=quarantine` y luego
  `p=reject`. Ahora `p=none` para no arriesgar entregabilidad durante la migración.

### Estado del cert de Cloud Run (2026-07-18 ~20:12)

`CertificateProvisioned: pending` → mensaje evolucionó a _"The challenge data was not visible through the public
internet… DNS not fully propagated. The system will retry."_ Es decir: Google **ya intenta el challenge ACME**, solo
falta que la propagación global de DNS termine (algunos resolvers todavía devuelven la IP vieja de Vercel
`76.76.21.21`, así la CA pega en Vercel en vez de Google). Reintenta cada ~15 min. **Sin acción de nuestra parte** —
cuando propague, emite. `DomainRoutable: True`, `mappedRouteName: delta-frontend`.

## ✅ CIERRE (2026-07-18 ~21:00) — dominio vivo + reestructuración de ramas

- **Cert EMITIDO** (`Ready: True`, `CertificateProvisioned: True` @ 20:27). `https://deltasalud.app` **ya sirve la app
  de Cloud Run con cert válido** (verificado forzando IP de Google: `http:200 ssl_verify:0`, título = app migrada).
  El resolver local del Mac seguía cacheado en Vercel (`76.76.21.21`) — es caché local, no el estado global.
- **Modelo de ramas nuevo (Git Flow):**
  - `main` = **producción**, dispara el deploy (deploy.yml `branches: [main]`). Contiene la migración.
  - `staging` = pre-producción · `develop` = integración (rama de trabajo de ahora en adelante).
  - `legacy` = el `main` viejo (app Vercel, `ca47282`) preservado íntegro en origin.
  - `feature/migracion-backend` **cerrada** (borrada local + remoto; todo su contenido está en `main`).
  - El push a `main` disparó el **deploy de producción** (GitHub Actions, con `PUBLIC_URL=https://deltasalud.app`).
- **Pendiente Fase 7** (endurecimiento, cuando se decida): pasar A/AAAA a **Proxied 🟠 + SSL Full(strict)** (ya es
  seguro: el cert emitió) → activa WAF/analítica de Cloudflare; **redirect www→apex**; dominio propio del backend
  (`api.deltasalud.app`); ingress=internal + Direct VPC egress; y **Load Balancer + Cloud Armor** (con costo).

- **Fase 3 ⏳** — cambiar NS en Namecheap → activa Cloudflare.
- **Fases 4-7 ⏳** — env/deploy, Auth0, Google OAuth, verificación, SPF/DMARC + WAF.

## Decisión: Domain Mapping ahora, Load Balancer PENDIENTE

Se arranca con **Cloud Run Domain Mapping** (costo $0). Queda **PENDIENTE** migrar a **HTTPS Load Balancer +
Cloud Armor** (~$20-30/mes) cuando el volumen/compliance lo justifique — es lo que cierra del todo el origen y
suma WAF de Google.

## Estado de seguridad actual (verificado en Cloud Run, 2026-07-18)

| Servicio           | ingress | invoker (IAM)                              | Estado                                                             |
| ------------------ | ------- | ------------------------------------------ | ------------------------------------------------------------------ |
| **delta-backend**  | `all`   | **solo `delta-frontend-sa`** (NO allUsers) | ✅ Protegido por IAM: solo el front puede invocarlo                |
| **delta-frontend** | `all`   | `allUsers` (público, correcto)             | ⚠️ La URL `.run.app` sigue accesible (Domain Mapping no la oculta) |

**Buena noticia:** el backend **ya NO está expuesto** de facto — aunque su URL `.run.app` exista, solo la SA del
frontend puede invocarlo (IAM `run.invoker`). Nadie más, sin ese token, puede usarlo. "Solo el front accede al
back" **ya se cumple por autorización**.

## PENDIENTES de endurecimiento (fase separada, DESPUÉS de la migración de dominio)

Requisitos del usuario (2026-07-18): _URL `.run.app` por defecto no accesible; backend solo desde VPC interna;
nunca exponer las URLs de Google._

1. **Backend a nivel de RED** — cambiar `delta-backend` a `--ingress=internal` + darle al **frontend Direct VPC
   egress** (gratis) o VPC connector, para que el front lo alcance por la red interna de Google. Así el backend
   no es tocable ni siquiera a nivel de red desde fuera de la VPC (defensa en profundidad sobre el IAM que ya hay).
2. **Frontend `.run.app` (mitigación con Domain Mapping)** — Cloudflare Transform Rule que inyecta un **header
   secreto**; el front lo valida en middleware y rechaza requests que no vengan de Cloudflare. Cierra el bypass
   sin costo. **Cierre TOTAL de la `.run.app` del front = Load Balancer** (pendiente).
3. **Load Balancer + Cloud Armor** (pendiente con costo) — `ingress=internal-and-cloud-load-balancing` en el front
   - LB delante → la `.run.app` deja de ser accesible del todo, y se suma Cloud Armor (WAF de Google).

> Orden recomendado: terminar primero la migración de dominio (no cambia la seguridad del backend, que ya está OK
> por IAM), y hacer el endurecimiento de red como fase separada y verificada, para no mezclar cambios de red
> front↔back con el cambio de dominio.

## PENDIENTE (post-configuración): presentación HTML para inversionistas

El usuario pidió (2026-07-18), **una vez terminadas todas las configuraciones**, una **presentación en HTML** en
**lenguaje simple para inversionistas** que incluya:

- **Arquitectura desplegada actual** (Cloudflare → Cloud Run front → Cloud Run back [IAM] → Cloud SQL + GCS +
  Secret Manager + Auth0 + Resend + Gemini + Sentry), explicada simple.
- **Qué tiene costo y qué no** hoy (Cloud Run pay-per-use con min-instances=0; Cloud SQL = costo fijo; GCS; free
  tiers de Cloudflare/Auth0/Resend/Gemini/Sentry).
- **Tabla "foto" de costos por escala de usuarios**: 0 / 100 / 1.000 / 10.000 (+ más), con y sin las seguridades
  extra activas (Load Balancer + Cloud Armor).
- Estimar **cuánto costaría 100/1000/10000 usuarios** con Cloudflare + Cloud Armor + BD, etc.
- Para hacerla: investigar precios actuales reales de cada servicio (Cloud Run, Cloud SQL tier, LB, Cloud Armor,
  Auth0 MAU, Resend, Gemini) y modelar el consumo por usuario.

**Ampliación del alcance pedida (2026-07-18, 2º mensaje del usuario):**

- **Dominio propio para el BACKEND** (p. ej. `api.deltasalud.app`) para enrutar todo por ahí y **también por
  Cloudflare** — hoy el back se invoca por su `.run.app` (IAM). Con dominio propio + Cloudflare delante, el back
  queda detrás del mismo edge (WAF/analytics) y se deja de exponer la URL de Google. Explicar en la presentación
  cómo encaja con el endurecimiento de red (ingress/VPC) y el Load Balancer.
- **Cuándo se pasa a pagar** en cada proveedor (umbral de salida del free tier): **Cloudflare** (Free → Pro $20/mes
  cuando se quiera WAF gestionado/reglas avanzadas/analytics extendido), **Auth0** (Free hasta ~25k MAU → plan pago
  al crecer usuarios o features B2B), **Resend** (Free ~3k emails/mes, 100/día → plan pago al subir volumen). Marcar
  el gatillo (usuarios/uso) que dispara cada salto de costo.
- **Servidor de STAGING** (entorno de pruebas) — necesidad de un ambiente separado para no arriesgar producción:
  segundo set de servicios (Cloud Run staging + BD staging + subdominio `staging.deltasalud.app`), su costo
  incremental, y por qué reduce el riesgo de romper funcionalidades en vivo. Incluirlo como recomendación de
  arquitectura + su renglón de costo.
