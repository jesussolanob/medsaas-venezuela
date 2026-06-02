# Plan Detallado — Fase 5: Infraestructura GCP

> **⚠️ ETAPA 2 — Abrir este archivo solo cuando `03-seguridad.md` esté completado.**
> No crear recursos en GCP hasta que Auth0 y la encriptación estén configurados y probados.

> Referencia: `master-plan.md` Fase 5
> Prerrequisito: `03-seguridad.md` completado — Auth0 BFF funcionando, encriptación con Secret Manager activa
> Entregable: ambos servicios en Cloud Run, NestJS solo accesible por VPC interna, datos migrados de Supabase a Cloud SQL

---

## Servicios GCP a crear

| Servicio | Propósito | Plan |
|----------|-----------|------|
| Cloud Run — frontend | Next.js | min 1, max 10 instancias |
| Cloud Run — backend | NestJS | min 1, max 10 instancias — **ingress: internal** |
| Cloud SQL | PostgreSQL 16 | db-standard-2, HA en prod |
| Memorystore for Redis | Caché + sesiones activas | 1GB basic tier |
| Cloud Storage | Archivos de pacientes | bucket privado + bucket público |
| Secret Manager | Claves de encriptación, secrets | 4 secretos |
| VPC | Red privada | Serverless VPC Access connector |
| Artifact Registry | Imágenes Docker | un repositorio |

---

## Paso 1 — Preparar proyecto GCP

```bash
# Instalar gcloud CLI si no está instalado
# Autenticar
gcloud auth login
gcloud auth application-default login

# Crear proyecto (o usar uno existente)
gcloud projects create delta-medical-prod --name="Delta Medical"
gcloud config set project delta-medical-prod

# Habilitar APIs necesarias
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  vpcaccess.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

---

## Paso 2 — VPC y Serverless VPC Access

```bash
# Crear VPC connector para que Cloud Run pueda conectar a Cloud SQL y Redis
gcloud compute networks vpc-access connectors create delta-vpc-connector \
  --region=us-central1 \
  --range=10.8.0.0/28 \
  --min-instances=2 \
  --max-instances=10
```

---

## Paso 3 — Secret Manager

```bash
# Crear los secretos (los valores se agregan desde la UI o con echo)
gcloud secrets create FIELD_ENCRYPTION_KEY --replication-policy=automatic
gcloud secrets create FIELD_ENCRYPTION_HMAC_SECRET --replication-policy=automatic
gcloud secrets create AUTH0_CLIENT_SECRET --replication-policy=automatic
gcloud secrets create AUTH0_SECRET --replication-policy=automatic
gcloud secrets create CLOUDFLARE_TURNSTILE_SECRET_KEY --replication-policy=automatic

# Agregar versión inicial a cada secreto
echo -n "$(openssl rand -hex 32)" | gcloud secrets versions add FIELD_ENCRYPTION_KEY --data-file=-
echo -n "$(openssl rand -hex 32)" | gcloud secrets versions add FIELD_ENCRYPTION_HMAC_SECRET --data-file=-
# El resto se agregan manualmente con los valores reales de Auth0 y Cloudflare
```

---

## Paso 4 — Service Accounts e IAM

```bash
# Service Account para el backend
gcloud iam service-accounts create delta-backend-sa \
  --display-name="Delta Medical Backend"

# Service Account para el frontend
gcloud iam service-accounts create delta-frontend-sa \
  --display-name="Delta Medical Frontend"

# Backend: acceso a Secret Manager (solo los secretos de encriptación)
gcloud secrets add-iam-policy-binding FIELD_ENCRYPTION_KEY \
  --member="serviceAccount:delta-backend-sa@delta-medical-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding FIELD_ENCRYPTION_HMAC_SECRET \
  --member="serviceAccount:delta-backend-sa@delta-medical-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Frontend: acceso a sus secretos de Auth0 y Turnstile
gcloud secrets add-iam-policy-binding AUTH0_CLIENT_SECRET \
  --member="serviceAccount:delta-frontend-sa@delta-medical-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding AUTH0_SECRET \
  --member="serviceAccount:delta-backend-sa@delta-medical-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Paso 5 — Cloud SQL (PostgreSQL 16)

```bash
# Crear instancia (puede tardar varios minutos)
gcloud sql instances create delta-medical-db \
  --database-version=POSTGRES_16 \
  --tier=db-standard-2 \
  --region=us-central1 \
  --availability-type=ZONAL \  # REGIONAL para HA en producción estable
  --storage-type=SSD \
  --storage-size=20GB \
  --storage-auto-increase \
  --backup \
  --backup-start-time=03:00 \
  --enable-point-in-time-recovery \
  --no-assign-ip \             # Sin IP pública — solo acceso via VPC
  --network=default

# Crear base de datos
gcloud sql databases create deltamedical --instance=delta-medical-db

# Crear usuario
gcloud sql users create delta \
  --instance=delta-medical-db \
  --password=$(openssl rand -base64 32)

# El password se guarda en Secret Manager
echo -n "LA_PASSWORD_GENERADA" | gcloud secrets versions add DATABASE_PASSWORD --data-file=-
```

`DATABASE_URL` en producción usa Cloud SQL Auth Proxy socket (no TCP):
```
postgres://delta:PASSWORD@/deltamedical?host=/cloudsql/delta-medical-prod:us-central1:delta-medical-db
```

---

## Paso 6 — Memorystore for Redis

```bash
gcloud redis instances create delta-redis \
  --size=1 \
  --region=us-central1 \
  --tier=BASIC \
  --redis-version=redis_7_0 \
  --connect-mode=PRIVATE_SERVICE_ACCESS
```

Obtener la IP interna de Redis:
```bash
gcloud redis instances describe delta-redis --region=us-central1 --format="get(host)"
# → ejemplo: 10.0.0.3
```

`REDIS_URL` en producción: `redis://:PASSWORD@10.0.0.3:6379`

---

## Paso 7 — Artifact Registry

```bash
gcloud artifacts repositories create delta-medical \
  --repository-format=docker \
  --location=us-central1 \
  --description="Delta Medical Docker images"

# Autenticar Docker con Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev
```

---

## Paso 8 — Dockerfiles

`apps/frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm nx build frontend --prod

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public ./apps/frontend/public
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/frontend/server.js"]
```

`apps/backend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm nx build backend --prod

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs
COPY --from=builder --chown=nestjs:nodejs /app/dist/apps/backend ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
USER nestjs
EXPOSE 3001
ENV PORT=3001
CMD ["node", "dist/main.js"]
```

---

## Paso 9 — Desplegar Cloud Run

**Backend (ingress interno — crítico):**

```bash
gcloud run deploy delta-backend \
  --image=us-central1-docker.pkg.dev/delta-medical-prod/delta-medical/backend:latest \
  --region=us-central1 \
  --service-account=delta-backend-sa@delta-medical-prod.iam.gserviceaccount.com \
  --ingress=internal \             # ← SOLO tráfico de la VPC interna
  --vpc-connector=delta-vpc-connector \
  --vpc-egress=all-traffic \
  --set-env-vars="NODE_ENV=production,GCP_PROJECT_ID=delta-medical-prod" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,AUTH0_DOMAIN=AUTH0_DOMAIN:latest,AUTH0_AUDIENCE=AUTH0_AUDIENCE:latest,AUTH0_ACTION_SECRET=AUTH0_ACTION_SECRET:latest" \
  --min-instances=1 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --port=3001 \
  --no-allow-unauthenticated
# ENCRYPTION_KEY y ENCRYPTION_HMAC_SECRET NO se pasan como env vars — el código las obtiene de Secret Manager via IAM

# Obtener la URL interna del backend
BACKEND_INTERNAL_URL=$(gcloud run services describe delta-backend --region=us-central1 --format="get(status.url)")
echo "Backend URL: $BACKEND_INTERNAL_URL"
```

**Frontend (acepta tráfico público de Cloudflare):**

```bash
gcloud run deploy delta-frontend \
  --image=us-central1-docker.pkg.dev/delta-medical-prod/delta-medical/frontend:latest \
  --region=us-central1 \
  --service-account=delta-frontend-sa@delta-medical-prod.iam.gserviceaccount.com \
  --ingress=all \                  # ← acepta tráfico de Cloudflare
  --vpc-connector=delta-vpc-connector \
  --vpc-egress=private-ranges-only \
  --set-env-vars="NODE_ENV=production" \
  --set-secrets="AUTH0_SECRET=AUTH0_SECRET:latest,AUTH0_CLIENT_SECRET=AUTH0_CLIENT_SECRET:latest,AUTH0_CLIENT_ID=AUTH0_CLIENT_ID:latest,AUTH0_ISSUER_BASE_URL=AUTH0_ISSUER_BASE_URL:latest,AUTH0_BASE_URL=AUTH0_BASE_URL:latest,CLOUDFLARE_TURNSTILE_SECRET_KEY=CLOUDFLARE_TURNSTILE_SECRET_KEY:latest" \
  --set-env-vars="BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL,NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY=TU_SITE_KEY,NEXT_PUBLIC_ENV=production" \
  --min-instances=1 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --port=3000 \
  --allow-unauthenticated
```

---

## Paso 10 — Cloud Storage

```bash
# Bucket privado para archivos de pacientes
gcloud storage buckets create gs://delta-medical-patients-files \
  --location=us-central1 \
  --uniform-bucket-level-access \
  --public-access-prevention=enforced

# Habilitar versionado
gcloud storage buckets update gs://delta-medical-patients-files --versioning

# Bucket público para logos de doctores
gcloud storage buckets create gs://delta-medical-public-assets \
  --location=us-central1 \
  --uniform-bucket-level-access

gcloud storage buckets add-iam-policy-binding gs://delta-medical-public-assets \
  --member=allUsers --role=roles/storage.objectViewer
```

---

## Paso 11 — CI/CD (GitHub Actions)

Ver `master-plan.md` sección 5.6 para los workflows completos. Secretos requeridos en GitHub:

```
GCP_SA_KEY_PROD          → JSON del Service Account con permisos de deploy
GCP_PROJECT_ID_PROD      → ID del proyecto GCP
GCP_REGION               → us-central1
```

El pipeline ejecuta migrations antes del deploy del backend:

```yaml
# Fragmento de deploy-production.yml
- name: Run migrations
  run: |
    gcloud run jobs execute delta-migrate-job \
      --region=$GCP_REGION \
      --wait
```

Cloud Run Job para migrations:

```bash
gcloud run jobs create delta-migrate-job \
  --image=us-central1-docker.pkg.dev/delta-medical-prod/delta-medical/backend:latest \
  --region=us-central1 \
  --service-account=delta-backend-sa@delta-medical-prod.iam.gserviceaccount.com \
  --vpc-connector=delta-vpc-connector \
  --vpc-egress=all-traffic \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest" \
  --set-env-vars="NODE_ENV=production" \
  --command="npx,sequelize-cli,db:migrate"
```

---

## Paso 12 — Migración de datos de Supabase a Cloud SQL

Script `tools/scripts/migrate-supabase-to-cloudsql.ts`:

1. Conectar a Supabase (source) con la service role key
2. Conectar a Cloud SQL (target) via `DATABASE_URL` de producción
3. Migrar en orden de dependencias de FK
4. Durante la migración de `patients`, `ehr_records`, `consultations`, `prescriptions`:
   - Encriptar los campos sensibles con AES-256-GCM
   - Calcular los `*_search_hash` correspondientes
5. Verificar conteos: `SELECT COUNT(*) FROM tabla` en ambas BDs deben coincidir
6. Generar reporte en `tools/scripts/migration-report.json`

**Ventana de mantenimiento:**
- Poner el frontend en modo "Sistema en mantenimiento" (variable de entorno `MAINTENANCE_MODE=true`)
- Ejecutar la migración
- Verificar conteos
- Desactivar modo mantenimiento

---

## Verificación de Fase 5 ✓

```bash
# Frontend responde en producción
curl https://tudominio.com/api/health
# → { "status": "ok" }

# Backend NO responde desde internet
curl https://delta-backend-XXXX-uc.a.run.app/api/health
# → Connection refused o 403

# Verificar que el backend responde desde el frontend (VPC interna)
# → Acceder a cualquier endpoint autenticado en la app y verificar que funciona

# Migrations aplicadas correctamente
gcloud run jobs execute delta-migrate-job --region=us-central1 --wait
# → Exit code 0
```

**Criterios de aceptación:**
- [ ] Frontend accesible en `https://tudominio.com`
- [ ] Backend NO accesible desde internet público
- [ ] Cloud SQL tiene los datos migrados de Supabase con campos sensibles cifrados
- [ ] Cloudflare proxy activo y WAF con requests bloqueados visibles en el dashboard
- [ ] Pipeline CI/CD completo en GitHub Actions (lint → test → build → migrate → deploy)
- [ ] `gcloud run services list` muestra ambos servicios con status `READY`
