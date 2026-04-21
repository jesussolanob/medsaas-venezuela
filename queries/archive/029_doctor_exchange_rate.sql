-- @allow-write
-- Configuración de tasa de cambio por doctor.
-- currency_mode:
--   'usd_bcv'  → tasa oficial USD/BsS desde bcv.org.ve (default)
--   'eur_bcv'  → tasa oficial EUR/BsS desde bcv.org.ve
--   'custom'   → el doctor fija la tasa manualmente (útil si usa tasa paralela o su propia)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS currency_mode text DEFAULT 'usd_bcv'
    CHECK (currency_mode IN ('usd_bcv','eur_bcv','custom')),
  ADD COLUMN IF NOT EXISTS custom_rate numeric CHECK (custom_rate IS NULL OR custom_rate > 0),
  ADD COLUMN IF NOT EXISTS custom_rate_label text;

-- Registros existentes quedan con default 'usd_bcv'
UPDATE profiles SET currency_mode = 'usd_bcv' WHERE currency_mode IS NULL;

-- Verificación
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
  AND column_name IN ('currency_mode','custom_rate','custom_rate_label');
