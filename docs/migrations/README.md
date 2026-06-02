# Migraciones

Notas sobre cambios de esquema en PostgreSQL (Supabase): convenciones de numeración, orden de aplicación, scripts locales (`npm run sql:watch`, `sql:run`) y runbooks.

**Referencia en raíz:** [migration-master-plan.md](../../migration-master-plan.md) — plan maestro; no mover sin acuerdo del equipo.

Los archivos SQL del proyecto suelen vivir en la carpeta de migraciones del repo (revisar `supabase/migrations/` o la ruta que use el proyecto).
