/**
 * Script para arreglar el rol de jesussolano4@gmail.com
 *
 * Ejecutar después del deploy:
 *
 * curl -X POST https://TU-DOMINIO/api/admin/fix-role \
 *   -H "Content-Type: application/json" \
 *   -d '{"email":"jesussolano4@gmail.com","role":"super_admin"}'
 *
 * O abrir la consola del navegador en la app y ejecutar:
 *
 * fetch('/api/admin/fix-role', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ email: 'jesussolano4@gmail.com', role: 'super_admin' })
 * }).then(r => r.json()).then(console.log)
 */
