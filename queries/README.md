# Queries — sistema de ejecución autónoma

Carpetas:
- `pending/` — SQL queries que Claude escribe aquí. El watcher las recoge y ejecuta.
- `results/` — resultados en JSON. Claude lee de aquí.
- `archive/` — los `.sql` ya ejecutados se mueven aquí.

## Safety gate
Por defecto toda query corre en **transacción READ ONLY**. Para permitir escrituras (`INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`, etc.), el archivo `.sql` debe tener en una de las primeras 12 líneas:

```sql
-- @allow-write
```

## Comandos
- `npm run sql:watch` — corre el watcher continuo (recomendado; deja una terminal abierta)
- `npm run sql:run queries/pending/archivo.sql` — ejecución one-shot

## Formato de resultados
```json
{
  "file": "001_diagnostico.sql",
  "executed_at": "2026-04-20T...",
  "mode": "READ_ONLY" | "READ_WRITE",
  "status": "success" | "error",
  "results": [
    {
      "command": "SELECT",
      "rowCount": 42,
      "fields": ["id","email","..."],
      "rows": [{...}]
    }
  ],
  "error": null | { message, code, hint, detail },
  "duration_ms": 123
}
```
