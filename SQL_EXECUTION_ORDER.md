# Orden de Ejecución de SQL Migrations

Ejecuta estos archivos SQL en Supabase en el siguiente orden exacto.

## 1. Migraciones Base
**Archivo:** `sql_migrations.sql`
- Crea tablas base (profiles, patients, appointments, consultations, etc.)
- RLS policies
- Funciones DB

## 2. Seed de Citas y Datos de Prueba
**Archivo:** `sql_appointments_and_testdata.sql`
- Inserta datos de prueba iniciales
- Citas de ejemplo
- Pacientes base

## 3. Tabla de Documentos de Facturación
**Archivo:** `sql_billing_documents.sql`
- Crea tabla `billing_documents` para facturas, recibos, presupuestos
- Agrega columnas a `appointments`: `plan_sessions_remaining`
- Agrega columnas a `profiles`: `whatsapp_token`, `whatsapp_phone_id`, `google_refresh_token`

## 4. Historial Clínico (EHR) — 3 Pacientes + 9 Consultas
**Archivo:** `sql_seed_ehr.sql`
- Inserta 3 nuevos pacientes: Pedro Ramírez, Lucía Márquez, Andrés Rivas
- Crea 9 consultas variadas (3 por paciente)
- Crea tabla `prescriptions` si no existe
- Inserta recetas (medicamentos, dosis, duración)

## 5. Datos Adicionales del Médico (Seguros, Métodos de Pago)
**Archivo:** `sql_seed_data_v2_fixed.sql`
- Datos de pacientes, seguros, métodos de pago
- Consultas con pagos y seguros
- Configuración completa del doctor de prueba

---

## Comandos Rápidos en Supabase

```sql
-- En SQL Editor de Supabase, ejecuta cada archivo por separado:

-- 1. Copiar contenido de sql_migrations.sql
-- PASTE Y EJECUTAR

-- 2. Copiar contenido de sql_appointments_and_testdata.sql
-- PASTE Y EJECUTAR

-- 3. Copiar contenido de sql_billing_documents.sql
-- PASTE Y EJECUTAR

-- 4. Copiar contenido de sql_seed_ehr.sql
-- PASTE Y EJECUTAR

-- 5. Copiar contenido de sql_seed_data_v2_fixed.sql
-- PASTE Y EJECUTAR
```

---

## Verificación

Después de ejecutar todos, verifica en Supabase:

```sql
-- Ver médicos
SELECT id, full_name, specialty FROM profiles LIMIT 1;

-- Ver pacientes (debe haber 13: 10 + 3 nuevos)
SELECT COUNT(*) as total_patients FROM patients;

-- Ver consultas (debe haber 13: 10 + 3 nuevos EHR)
SELECT COUNT(*) as total_consultations FROM consultations;

-- Ver prescriptions (debe haber 7 recetas)
SELECT COUNT(*) as total_prescriptions FROM prescriptions;

-- Ver documentos de facturación (vacío al inicio)
SELECT COUNT(*) as total_documents FROM billing_documents;
```

---

## Notas Importantes

- **Idempotencia:** Todos los INSERT usan `ON CONFLICT DO NOTHING` para evitar duplicados
- **Orden:** NO cambies el orden. Las consultas posteriores dependen de datos de anteriores
- **RLS:** Todos los datos se filtan por `doctor_id = auth.uid()`
- **Transacciones:** Cada archivo está en una transacción para consistencia

---

## En Caso de Error

Si un SQL falla:
1. Lee el mensaje de error en Supabase
2. Verifica que la tabla base existe
3. Asegúrate de ejecutar en orden correcto
4. No continúes hasta resolver el error
5. Puedes rollback en Supabase y reintentar

---

¡Listo! Una vez ejecutados todos, tendrás el SaaS completamente funcional con datos de prueba.
