// @ts-check
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

/**
 * ESLint flat config for apps/backend.
 *
 * Key rules enforced:
 *   - @typescript-eslint/no-explicit-any → error
 *   - @typescript-eslint/no-floating-promises → error
 *   - no-console → warn (intentional dev-mode usage in database.config.ts is allowed)
 *
 * Usage:
 *   node_modules/.bin/eslint apps/backend/src --config apps/backend/eslint.config.mjs
 */

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  // Base recommended rules from ESLint
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: [
          './tsconfig.app.json',
          './tsconfig.spec.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Pull in typescript-eslint recommended rules
      ...tsPlugin.configs['eslint-recommended'].overrides?.[0]?.rules,
      ...tsPlugin.configs.recommended.rules,

      // Rules required by the gate
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      'no-console': 'warn',

      // Allow _prefixed unused variables (common in destructuring to omit a field)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // Disable rules that conflict with NestJS decorator patterns or Sequelize typing
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Test files: relax some rules to allow jest patterns
    files: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
  {
    // Known dev-mode console usage in infrastructure config
    files: ['src/infrastructure/config/database.config.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.cjs', '**/*.mjs', '**/*.cts'],
  },
];
