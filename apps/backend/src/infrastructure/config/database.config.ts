import type { SequelizeModuleOptions } from '@nestjs/sequelize';
import { Logger } from '@nestjs/common';

const sqlLogger = new Logger('SQL');

/**
 * Sequelize connection options for the NestJS SequelizeModule.
 *
 * `synchronize` is ALWAYS false — schema changes go through explicit Sequelize
 * migrations (never auto-sync against a real database).
 */
export const databaseConfig = (): SequelizeModuleOptions => ({
  dialect: 'postgres',
  uri: process.env.DATABASE_URL,
  autoLoadModels: true,
  synchronize: false,
  // SQL logging is off by default. Set DEBUG_SQL=true to enable during development.
  // Never enable in production — SQL logs can contain PII values from parameterized queries.
  logging: process.env.DEBUG_SQL === 'true' ? (sql: string) => sqlLogger.debug(sql) : false,
  pool: { max: 10, min: 2, acquire: 30000, idle: 10000 },
  dialectOptions: {
    ssl:
      process.env.NODE_ENV === 'production' ? { require: true, rejectUnauthorized: false } : false,
  },
});
