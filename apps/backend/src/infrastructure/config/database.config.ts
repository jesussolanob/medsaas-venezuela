import type { SequelizeModuleOptions } from '@nestjs/sequelize';

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
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: { max: 10, min: 2, acquire: 30000, idle: 10000 },
  dialectOptions: {
    ssl:
      process.env.NODE_ENV === 'production' ? { require: true, rejectUnauthorized: false } : false,
  },
});
