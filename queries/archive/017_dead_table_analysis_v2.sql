-- pg_stat_user_tables usa relname, no tablename. Fix.
SELECT 'A_table_rows' AS section,
  schemaname || '.' || relname AS tbl,
  n_live_tup AS row_count,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||quote_ident(relname))) AS size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC, relname;

SELECT 'B_empty_tables' AS section,
  relname AS tablename
FROM pg_stat_user_tables
WHERE schemaname='public' AND n_live_tup = 0
ORDER BY relname;
