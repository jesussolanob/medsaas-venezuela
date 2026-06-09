# SPEC — Fix phone perfil del doctor (MEDIUM)

> Bug QA: `/doctor/settings` muestra el campo "Teléfono" editable, el doctor lo escribe y guarda,
> pero se pierde en silencio. `settings/actions.ts updateProfile` solo manda specialty+professional_title,
> y el `UpdateDoctorProfileDtoSchema` es `.strict()` sin `phone`. La columna `profiles.phone` YA existe.

## Objetivo: cablear `phone` end-to-end en el perfil del doctor (GET + PUT).

NO hay migración nueva — la columna `profiles.phone` ya existe en la tabla.

### Backend (módulo `doctor-settings` + lib `shared-types`)

1. `libs/shared-types/src/dtos/update-doctor-profile.dto.ts`:
   añadir al schema (mantener `.strict()`): `phone: z.string().max(30).nullable().optional()`.

2. `apps/backend/src/modules/doctor-settings/domain/entities/doctor-profile.entity.ts`:
   - `DoctorProfileCreateParams`: añadir `phone: string | null`.
   - `DoctorProfileUpdateParams`: añadir `phone?: string | null`.
   - clase `DoctorProfile`: añadir `readonly phone: string | null` + asignarlo en el constructor.

3. `apps/backend/src/modules/doctor-settings/infrastructure/database/models/*doctor-profile*.model.ts` (o el model de profiles que use el módulo):
   confirmar/añadir el column mapping `phone` → `profiles.phone` (campo `phone`, TEXT/string nullable, `field: 'phone'` underscored si aplica).

4. `sequelize-doctor-profile.repository.ts`:
   - `update`: añadir el spread condicional `...(params.phone !== undefined && { phone: params.phone })`.
   - `toDomain`: añadir `phone: row.phone`.
   - (si `create`/seed arma el CreateParams, incluir `phone: row.phone`.)

5. `doctor.controller.ts` `updateProfileHandler`: pasar `phone: dto.phone` dentro del objeto que se manda a `updateProfile.execute`.
   El GET de perfil ya devolverá `phone` automáticamente porque `DoctorProfile` ahora lo incluye
   (verificar que el mapper/serialización del GET lo exponga como `phone`).

### Frontend (lead inline — thin)

`apps/frontend/app/doctor/settings/actions.ts`:
- `DoctorProfile` (shape camelCase del GET/PUT): añadir `phone: string | null`.
- En el mapping del GET (hoy `phone: ''` hardcodeado, línea ~137): usar `b.phone ?? ''`.
- En `updateProfile` (input + payload del PUT): incluir `phone` en el body enviado a `backendPut('/api/doctor/profile', {... , phone })`.
- Quitar el comentario obsoleto "phone → not in profiles model for this module".
- NO tocar JSX/estilos — el campo "Teléfono" ya existe en la UI; solo cablear la capa de datos.

## Verificación (LEAD)
- `nx build/lint/test backend` EXIT real + boot dist.
- curl (doctor dev): `PUT /api/doctor/profile {phone:"04141234567"}` → 200; luego `GET /api/doctor/profile` → `phone:"04141234567"`.
- Confirmar en BD: `SELECT phone FROM profiles WHERE id='00000000-0000-4000-8000-000000000001'`.
- Navegador: editar teléfono en /doctor/settings → guardar → recargar → persiste.
