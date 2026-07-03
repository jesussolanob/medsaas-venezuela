# 08 — QA Lote DELTA (tester, 2026-07-03)

> Segundo lote de QA del tester sobre plan **delta_base** (marcoviajes11 en prod).
> Estado: `TODO` | `INVESTIGANDO` | `FIX` | `VERIFICADO-LOCAL` | `DEPLOYED`.
> Ojo: algunos pueden estar YA resueltos por el deploy del lote anterior (commits
> 6fa58aa + 29a9cc6) — verificar antes de re-arreglar.

## Clasificación: 🐛 bug · ✨ feature · 🎨 decisión de producto · ♻️ posible ya-arreglado

### MÓDULO INICIO

- [ ] ✨ Listado de consultas por confirmar (widget dashboard)
- [ ] ✨ Botón "registrar pago" → permitir registrar ingreso + consultas pendientes
- [ ] 🐛🎨 Crear paciente: validar duplicado · datos no-demográficos opcionales · nuevo campo "parentesco" del contacto de emergencia
- [ ] 🐛 Al crear paciente, pop-up de crear consulta: botón "crear" no funciona (solo "más tarde")
- [ ] ♻️ Consulta creada por médico / mismo día → debe nacer confirmada (auto-confirm ya implementado; VERIFICAR "mismo día")

### MÓDULO AGENDA

- [ ] 🎨 Prefijo de país editable + dropdown de países
- [ ] 🐛 Bloque de semana: no deja el input en blanco para escribir un número completo
- [ ] ♻️ No permite borrar la consulta (delete ya implementado; VERIFICAR path)
- [ ] 🐛 Detalle de consulta redirige a "Cita 360" (feature eliminada)
- [ ] 🎨 Nueva consulta: logo nuevo + reorden (paciente → consultorio → consulta asociada al consultorio → horario → método de pago)
- [ ] 🎨 Método de pago: botón "pagar después" + mostrar solo métodos activados por el médico con sus datos
- [ ] 🐛 No debe mostrar horarios bloqueados
- [ ] 🐛 Filtros (agendadas/confirmadas, pagado/pendiente) no actualizan el calendario

### MÓDULO PACIENTES

- [ ] 🐛 Guarda la fecha de nacimiento -1 día (timezone)
- [ ] 🐛♻️ No guarda dirección / datos médicos / contacto de emergencia (VERIFICAR vs fix de edición del lote previo — puede ser el flujo de CREAR)
- [ ] 🐛 Desde historial de consulta: poder iniciar la consulta o abrir el detalle
- [ ] 🐛 Historial médico: cambiar botón "Generar resumen" → "Ver planes"
- [ ] ✨ Seguimiento "pedir algo al paciente" + cargar archivos (Fase 5) → feature nueva (portal + código por correo)

### MÓDULO CONSULTA

- [ ] 🐛 Botón "generar informe" dice "Compartir documentos disponible próximamente"
- [ ] 🐛 Compartir: email/WhatsApp dice "el paciente no tiene correo" cuando SÍ tiene
- [ ] 🐛 "Atendida" se desmarca al reingresar a la consulta
- [ ] 🎨 Cada notificación debe confirmarse con un toast
- [ ] 🐛 Muestra "Paciente" en vez del nombre del paciente

### MÓDULO CONSULTORIO

- [ ] 🐛 No se puede registrar más de un bloque de horarios por consultorio
- [ ] 🐛 Se pueden sobreescribir horarios (dos consultorios con el mismo horario)

### MÓDULO FINANZAS

- [ ] ✨ Falta botón "+ agregar ingreso" (como en gasto)
- [ ] 🐛 Gráfico de barras no se visualiza
- [ ] 🐛 Gastos registrados no se visualizan en el resumen

### MÓDULO COBROS

- [ ] 🐛 No trae el detalle de consultas pendientes (si las hay)

### MÓDULO MARKETING

- [ ] 🐛 Los emojis del mensaje no se ven (encoding)

### MÓDULO LINK PÚBLICO

- [ ] 🐛 No permite carga de imágenes
- [ ] 🐛 Confirmar cita no hace nada — Error "Validation failed" (endpoint booking público; distinto al del área doctor ya arreglado)

### MÓDULO CONFIGURACIÓN

- [ ] 🐛 No se pueden cargar imágenes
- [ ] 🎨 Prefijo de país estandarizado + editable

## Decisiones de producto (usuario, 2026-07-03)

- **Alcance: LOTE COMPLETO** — incluye las 2 features grandes: "solicitud al paciente"/seguimiento
  con archivos (portal + código por correo, modelado sobre document-sharing) y el rediseño de
  "Nueva consulta" (reorden paciente→consultorio→consulta→horario→pago + "pagar después" + solo
  métodos de pago activos del médico). Programa multi-sesión.
- **Prefijo de país:** componente compartido = dropdown LatAm (bandera + prefijo) + editable,
  default Venezuela +58. Usar en Agenda, Configuración y Pacientes.
- **Logo "nueva consulta":** usar el logo/branding actual por ahora (no bloquear por asset).

## Notas de ejecución

- Equipo de agentes (backend/frontend) + code-review/security en cambios sensibles. Lead conduce Playwright.
- Uploads de imágenes fallan en 3 módulos (link público, configuración, agenda nueva consulta) → probable causa común (storage/route handler). Investigar juntos.
- "Confirmar cita Validation failed" (público) huele al mismo patrón del DTO que exige campos server-derived en el body.
