import type { SequelizeModuleOptions } from '@nestjs/sequelize';
import { Logger } from '@nestjs/common';

const sqlLogger = new Logger('SQL');

const DEFAULT_POOL_MAX = 5;
const DEFAULT_POOL_MIN = 0;

/**
 * Reads a non-negative integer env var, falling back to `fallback` when unset
 * or invalid. Used so the connection pool can be tuned per environment without
 * a code change.
 */
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Cloud SQL is reached from Cloud Run through a local unix socket
 * (`host=/cloudsql/<conn>`), which is already encrypted by the connector — no
 * TLS layer is added on top. Public TCP connections in production still use TLS.
 */
function isCloudSqlSocket(url: string | undefined): boolean {
  return !!url && url.includes('/cloudsql/');
}

/**
 * Sequelize connection options for the NestJS SequelizeModule.
 *
 * `synchronize` is ALWAYS false — schema changes go through explicit Sequelize
 * migrations (never auto-sync against a real database).
 *
 * Pool sizing matters on Cloud Run: each container instance keeps its own pool,
 * so total connections = (max instances) × DB_POOL_MAX. Keep DB_POOL_MAX small
 * and bound `--max-instances` so the sum stays under the Cloud SQL connection
 * limit. Defaults: max=5, min=0 (idle instances hold no connections).
 */
export const databaseConfig = (): SequelizeModuleOptions => {
  const url = process.env.DATABASE_URL;
  const useSocket = isCloudSqlSocket(url);
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    dialect: 'postgres',
    uri: url,
    autoLoadModels: true,
    synchronize: false,
    // SQL logging is off by default. Set DEBUG_SQL=true to enable during development.
    // Never enable in production — SQL logs can contain PII values from parameterized queries.
    logging: process.env.DEBUG_SQL === 'true' ? (sql: string) => sqlLogger.debug(sql) : false,
    pool: {
      max: intFromEnv('DB_POOL_MAX', DEFAULT_POOL_MAX),
      min: intFromEnv('DB_POOL_MIN', DEFAULT_POOL_MIN),
      acquire: 30000,
      idle: 10000,
    },
    dialectOptions: {
      // Socket connections (Cloud SQL connector) are already encrypted; TLS only
      // applies to public TCP connections in production.
      ssl: isProduction && !useSocket ? { require: true, rejectUnauthorized: false } : false,
    },
  };
};
