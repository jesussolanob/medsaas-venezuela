-- Add permissions column to admin_roles table
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS permissions TEXT[] DEFAULT '{}';
