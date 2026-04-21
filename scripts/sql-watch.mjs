#!/usr/bin/env node
/**
 * scripts/sql-watch.mjs
 *
 * Watcher que ejecuta queries SQL desde queries/pending/*.sql
 * contra tu Supabase (vía Postgres pooler) y escribe los resultados en
 * queries/results/*.json.
 *
 * Modo seguro por defecto (READ ONLY). Para permitir escrituras, el archivo
 * SQL debe contener en alguna de las primeras 10 líneas:
 *
 *     -- @allow-write
 *
 * Uso:
 *   1) Copia tu connection string de Postgres en .env.local como SUPABASE_DB_URL
 *   2) npm install (para pg + chokidar)
 *   3) npm run sql:watch  → deja esta terminal corriendo
 *   4) Cada vez que caiga un .sql nuevo en queries/pending/, se ejecuta
 *      y aparece un JSON con el resultado en queries/results/
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chokidar from 'chokidar'
import pg from 'pg'
import dotenv from 'dotenv'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// Carga variables de .env.local (sin sobrescribir las que ya existan)
dotenv.config({ path: path.join(ROOT, '.env.local') })

const DB_URL = process.env.SUPABASE_DB_URL
if (!DB_URL) {
  console.error('❌  Falta SUPABASE_DB_URL en .env.local')
  console.error('   Agrégalo con la connection string de Supabase Dashboard →')
  console.error('   Project Settings → Database → Connection string → "Transaction pooler"')
  console.error('   Formato: postgresql://postgres.<ref>:<password>@aws-0-...pooler.supabase.com:6543/postgres')
  process.exit(1)
}

const PENDING_DIR = path.join(ROOT, 'queries', 'pending')
const RESULTS_DIR = path.join(ROOT, 'queries', 'results')
const ARCHIVE_DIR = path.join(ROOT, 'queries', 'archive')

// ─────────────────────────────────────────────────────────────────────────────
// Inicialización
// ─────────────────────────────────────────────────────────────────────────────
await fs.mkdir(PENDING_DIR, { recursive: true })
await fs.mkdir(RESULTS_DIR, { recursive: true })
await fs.mkdir(ARCHIVE_DIR, { recursive: true })

const { Pool } = pg
const pool = new Pool({
  connectionString: DB_URL,
  // Supabase pooler requiere SSL con certificado no verificado
  ssl: { rejectUnauthorized: false },
  max: 4,
  idleTimeoutMillis: 30_000,
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function hasAllowWrite(sql) {
  const head = sql.split('\n').slice(0, 12).join('\n')
  return /--\s*@allow-write\b/i.test(head)
}

function stringifyBig(obj) {
  // Serializa BigInt, Date, Buffer a cosas lindas
  return JSON.stringify(obj, (_, v) => {
    if (typeof v === 'bigint') return v.toString()
    if (v instanceof Date) return v.toISOString()
    if (v instanceof Buffer) return '<buffer>'
    return v
  }, 2)
}

async function runSqlFile(filePath) {
  const basename = path.basename(filePath, '.sql')
  const sql = await fs.readFile(filePath, 'utf8')
  const allowWrite = hasAllowWrite(sql)
  const t0 = Date.now()
  const client = await pool.connect()

  const out = {
    file: basename + '.sql',
    executed_at: new Date().toISOString(),
    mode: allowWrite ? 'READ_WRITE' : 'READ_ONLY',
    status: 'success',
    results: [],
    error: null,
    duration_ms: 0,
  }

  try {
    // Tx READ ONLY si no hay @allow-write
    await client.query('BEGIN')
    if (!allowWrite) {
      await client.query('SET TRANSACTION READ ONLY')
    }

    // Ejecuta todo el archivo como multi-statement.
    // pg devuelve un array de Results (uno por statement) si hay múltiples.
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
  }

  const outPath = path.join(RESULTS_DIR, basename + '.json')
  await fs.writeFile(outPath, stringifyBig(out))

  // Mueve el .sql a archive para no re-ejecutar
  const archivePath = path.join(ARCHIVE_DIR, path.basename(filePath))
  await fs.rename(filePath, archivePath)

  const emoji = out.status === 'success' ? '✅' : '❌'
  console.log(`${emoji}  ${basename}.sql  ${out.mode}  ${out.duration_ms}ms → queries/results/${basename}.json`)
  if (out.status === 'error') {
    console.log(`   ${out.error.message}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Loop
// ─────────────────────────────────────────────────────────────────────────────
async function testConnection() {
  const client = await pool.connect()
  try {
    const r = await client.query('SELECT current_database() as db, current_user as usr, version() as v')
    console.log(`🟢  Conectado — db=${r.rows[0].db} user=${r.rows[0].usr}`)
  } finally {
    client.release()
  }
}

console.log('🚀  sql-watch iniciado')
console.log(`   pending: ${PENDING_DIR}`)
console.log(`   results: ${RESULTS_DIR}`)
console.log(`   archive: ${ARCHIVE_DIR}`)

try {
  await testConnection()
} catch (err) {
  console.error('❌  No pude conectar a Supabase:', err.message)
  console.error('   Revisa tu SUPABASE_DB_URL en .env.local')
  process.exit(1)
}

const watcher = chokidar.watch(PENDING_DIR, {
  persistent: true,
  ignoreInitial: false,
  awaitWriteFinish: { stabilityThreshold: 300 },
})

watcher.on('add', async (filePath) => {
  if (!filePath.endsWith('.sql')) return
  try {
    await runSqlFile(filePath)
  } catch (err) {
    console.error(`💥  Error fatal procesando ${filePath}:`, err)
  }
})

process.on('SIGINT', async () => {
  console.log('\n👋  cerrando…')
  await pool.end()
  process.exit(0)
})
