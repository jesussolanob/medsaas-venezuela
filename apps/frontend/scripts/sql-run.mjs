#!/usr/bin/env node
/**
 * scripts/sql-run.mjs
 *
 * Ejecuta un archivo SQL específico (one-shot), escribe el resultado JSON
 * en queries/results/ y termina. Útil para CI o ejecuciones manuales.
 *
 * Uso:  node scripts/sql-run.mjs queries/pending/foo.sql
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(ROOT, '.env.local') })

const DB_URL = process.env.SUPABASE_DB_URL
if (!DB_URL) {
  console.error('❌  Falta SUPABASE_DB_URL en .env.local')
  process.exit(1)
}

const filePath = process.argv[2]
if (!filePath) {
  console.error('Uso: node scripts/sql-run.mjs <archivo.sql>')
  process.exit(1)
}

const RESULTS_DIR = path.join(ROOT, 'queries', 'results')
await fs.mkdir(RESULTS_DIR, { recursive: true })

const { Pool } = pg
const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
})

function hasAllowWrite(sql) {
  const head = sql.split('\n').slice(0, 12).join('\n')
  return /--\s*@allow-write\b/i.test(head)
}

const sql = await fs.readFile(filePath, 'utf8')
const allowWrite = hasAllowWrite(sql)
const basename = path.basename(filePath, '.sql')
const out = {
  file: path.basename(filePath),
  executed_at: new Date().toISOString(),
  mode: allowWrite ? 'READ_WRITE' : 'READ_ONLY',
  status: 'success',
  results: [],
  error: null,
  duration_ms: 0,
}
const t0 = Date.now()
const client = await pool.connect()

try {
  await client.query('BEGIN')
  if (!allowWrite) await client.query('SET TRANSACTION READ ONLY')

  const r = await client.query(sql)
  const arr = Array.isArray(r) ? r : [r]
  for (const x of arr) {
    out.results.push({
      command: x.command ?? null,
      rowCount: x.rowCount ?? null,
      fields: (x.fields ?? []).map(f => f.name),
      rows: x.rows ?? [],
    })
  }
  await client.query('COMMIT')
} catch (err) {
  try { await client.query('ROLLBACK') } catch {}
  out.status = 'error'
  out.error = {
    message: err?.message ?? String(err),
    code: err?.code ?? null,
    position: err?.position ?? null,
    hint: err?.hint ?? null,
    detail: err?.detail ?? null,
  }
} finally {
  client.release()
  out.duration_ms = Date.now() - t0
  await pool.end()
}

const outPath = path.join(RESULTS_DIR, basename + '.json')
await fs.writeFile(outPath, JSON.stringify(out, (_, v) => {
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Date) return v.toISOString()
  return v
}, 2))

const emoji = out.status === 'success' ? '✅' : '❌'
console.log(`${emoji}  ${basename}.sql  ${out.mode}  ${out.duration_ms}ms → queries/results/${basename}.json`)
if (out.status === 'error') {
  console.log(`   ${out.error.message}`)
  process.exit(1)
}
