-- @allow-write
-- Poblar plan_configs y plan_features con los 4 planes del MVP.
-- Idempotente via ON CONFLICT. Adaptado de CLAUDE.md.

-- ─── Estado actual ─────────────────────────────────────────────────────────
SELECT 'PRE_plan_configs' AS section, plan_key, name, price, is_active
FROM plan_configs ORDER BY sort_order;

SELECT 'PRE_plan_features_count' AS section, plan, COUNT(*) AS n
FROM plan_features GROUP BY plan ORDER BY plan;

-- ─── plan_configs (4 planes MVP) ───────────────────────────────────────────
INSERT INTO plan_configs (plan_key, name, price, trial_days, description, is_active, sort_order)
VALUES
  ('trial',        'Trial Beta Privada', 0,   15, 'Acceso gratuito por 15 días',                  true, 1),
  ('basic',        'Básico',             10,  0,  'Ideal para médicos independientes',            true, 2),
  ('professional', 'Profesional',        30,  0,  'Para médicos con alto volumen de pacientes',   true, 3),
  ('clinic',       'Clínica',            100, 0,  'Gestión de múltiples médicos y consultorios',  true, 4)
ON CONFLICT (plan_key) DO UPDATE
  SET name        = EXCLUDED.name,
      price       = EXCLUDED.price,
      trial_days  = EXCLUDED.trial_days,
      description = EXCLUDED.description,
      is_active   = EXCLUDED.is_active,
      sort_order  = EXCLUDED.sort_order,
      updated_at  = NOW();

-- ─── plan_features (todos los módulos habilitados en cada plan por MVP) ─────
-- Keys disponibles: dashboard, agenda, patients, consultations, ehr, finances,
--                    billing, reports, crm, reminders, messages, invitations, settings

-- Helper: borra features existentes y reinserta limpio (idempotente)
DELETE FROM plan_features
WHERE plan IN ('trial','basic','professional','clinic');

INSERT INTO plan_features (plan, feature_key, feature_label, enabled) VALUES
  -- TRIAL: todos los módulos core
  ('trial','dashboard','Dashboard',true),
  ('trial','agenda','Agenda',true),
  ('trial','patients','Pacientes',true),
  ('trial','consultations','Consultas',true),
  ('trial','ehr','Historia clínica',true),
  ('trial','finances','Finanzas',true),
  ('trial','billing','Facturación',true),
  ('trial','reports','Reportes',true),
  ('trial','crm','CRM',false),
  ('trial','reminders','Recordatorios',true),
  ('trial','messages','Mensajes',true),
  ('trial','invitations','Invitaciones',false),
  ('trial','settings','Configuración',true),

  -- BASIC: core sin CRM ni invitaciones
  ('basic','dashboard','Dashboard',true),
  ('basic','agenda','Agenda',true),
  ('basic','patients','Pacientes',true),
  ('basic','consultations','Consultas',true),
  ('basic','ehr','Historia clínica',true),
  ('basic','finances','Finanzas',true),
  ('basic','billing','Facturación',true),
  ('basic','reports','Reportes',true),
  ('basic','crm','CRM',false),
  ('basic','reminders','Recordatorios',true),
  ('basic','messages','Mensajes',true),
  ('basic','invitations','Invitaciones',false),
  ('basic','settings','Configuración',true),

  -- PROFESSIONAL: todo incluido
  ('professional','dashboard','Dashboard',true),
  ('professional','agenda','Agenda',true),
  ('professional','patients','Pacientes',true),
  ('professional','consultations','Consultas',true),
  ('professional','ehr','Historia clínica',true),
  ('professional','finances','Finanzas',true),
  ('professional','billing','Facturación',true),
  ('professional','reports','Reportes',true),
  ('professional','crm','CRM',true),
  ('professional','reminders','Recordatorios',true),
  ('professional','messages','Mensajes',true),
  ('professional','invitations','Invitaciones',false),
  ('professional','settings','Configuración',true),

  -- CLINIC: todo + invitaciones de médicos
  ('clinic','dashboard','Dashboard',true),
  ('clinic','agenda','Agenda',true),
  ('clinic','patients','Pacientes',true),
  ('clinic','consultations','Consultas',true),
  ('clinic','ehr','Historia clínica',true),
  ('clinic','finances','Finanzas',true),
  ('clinic','billing','Facturación',true),
  ('clinic','reports','Reportes',true),
  ('clinic','crm','CRM',true),
  ('clinic','reminders','Recordatorios',true),
  ('clinic','messages','Mensajes',true),
  ('clinic','invitations','Invitaciones',true),
  ('clinic','settings','Configuración',true);

-- ─── Verificación ──────────────────────────────────────────────────────────
SELECT 'POST_plan_configs' AS section, plan_key, name, price, is_active, sort_order
FROM plan_configs ORDER BY sort_order;

SELECT 'POST_plan_features_by_plan' AS section,
  plan,
  COUNT(*) FILTER (WHERE enabled = true)  AS enabled,
  COUNT(*) FILTER (WHERE enabled = false) AS disabled
FROM plan_features
GROUP BY plan
ORDER BY plan;
