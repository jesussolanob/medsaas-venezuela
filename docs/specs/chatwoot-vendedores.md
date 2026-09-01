# Spec / Runbook — Chatwoot para el equipo de vendedores

> Escrito por el lead el 2026-09-01. Retoma `memory-bank/12-plan-whatsapp-ventas.md` (investigación
> y decisión de plataforma del 2026-08-18) con **un cambio de alcance del dueño**.

## 0. El cambio de alcance que destraba el proyecto

El plan original arrancaba con un bot de IA en WhatsApp, y por eso tenía una **Etapa 0 bloqueante:
mover Gemini a Vertex AI**, porque el nivel gratuito entrena con lo que recibe y un médico termina
pegando la cédula de un paciente en el chat.

El pedido del dueño (2026-09-01) es más chico y más urgente: **que los vendedores puedan hablar con
los especialistas potenciales**. Eso es humano ↔ humano.

**Sin bot no hay PII yendo a Gemini, así que la Etapa 0 deja de bloquear.** El orden se invierte:

| Antes                     | Ahora                                                         |
| ------------------------- | ------------------------------------------------------------- |
| 0. Vertex AI (bloqueante) | 1. Canal humano: Chatwoot + WhatsApp + usuarios de vendedores |
| 1. Probar que la IA vende | 2. Vertex AI                                                  |
| 2. Montar Chatwoot        | 3. El bot comercial, sobre Vertex                             |

⚠️ **Cuando se agregue el bot, la Etapa 0 vuelve a ser bloqueante.** No es una decisión anulada,
es una decisión postergada junto con lo que la motivaba.

## 1. Qué se gana con esto (y qué no)

- El médico **nunca ve el celular personal** del vendedor.
- Si el vendedor se va, **la conversación y el historial se quedan**: no se lleva la cartera.
- Varios vendedores sobre el mismo número sin pisarse, porque hay asignación.
- Queda registro de qué se conversó y cómo se cerró.

Lo que **no** se gana todavía: respuestas automáticas, clasificación de leads, ni que el vendedor
vea el plan o los días de prueba del médico dentro del chat. Eso es la etapa 3.

## 2. Infraestructura — Chatwoot NO va en Cloud Run

Tres razones, todas verificadas en la investigación del 18/08:

1. **Sidekiq** (las tareas en segundo plano) tiene que correr siempre. Con `min-instances=0`, que
   es como está todo hoy, se apaga y **los mensajes de WhatsApp quedan encolados sin procesar**.
2. Usa **websockets** (ActionCable) para el tiempo real de la bandeja.
3. Es un monolito de Rails con estado, no una API de pedido y respuesta.

Con `min-instances=1` cuesta lo mismo que una VM y pelea con el diseño.

**Camino correcto: una VM con Docker Compose** (Postgres, Redis, Rails y Sidekiq juntos).

| Recurso                       | Detalle                                            | Costo            |
| ----------------------------- | -------------------------------------------------- | ---------------- |
| VM `e2-medium` (2 vCPU, 4 GB) | Ubuntu 22.04, `us-east1` (la misma región de todo) | US$ 24,46/mes    |
| Disco                         | 60 GB SSD                                          | ~US$ 6/mes       |
| IP fija                       | necesaria para el webhook de Meta                  | ~US$ 3,65/mes    |
| Postgres + Redis              | contenedores en la misma VM                        | US$ 0            |
| **Total**                     | **independiente de cuántos vendedores haya**       | **≈ US$ 34/mes** |

> Postgres va **en la VM, no en Cloud SQL**: mantiene el historial comercial separado de la base de
> pacientes. Redis va en la VM: no hace falta Memorystore (caro) y hoy está apagado
> (`REDIS_DISABLED=true`).

Lo que ya existe y se reusa: proyecto GCP y facturación, Cloudflare para `chat.deltasalud.app`,
**Resend** como SMTP, GCS para archivos.

## 3. Pasos de montaje

1. Crear la VM `e2-medium`, Ubuntu 22.04, disco 60 GB, IP fija, `us-east1`.
2. Docker + Docker Compose con el stack oficial de Chatwoot.
3. `chat.deltasalud.app` por Cloudflare con HTTPS (mismo camino que el resto del dominio).
4. Correo saliente con las credenciales de Resend que ya existen.
5. Usuarios: un agente de Chatwoot por vendedor (§4).
6. Conectar WhatsApp: Business Account ID, Phone Number ID y token permanente. **Este paso depende
   de Meta, no de nosotros.**
7. 🔴 **Respaldo automático del volumen de Postgres a GCS desde el día uno.** Si la VM se pierde, se
   pierde todo el historial comercial. Esto no se deja para después.

## 4. Usuarios de vendedores — `profiles` es la fuente de verdad

Pedido explícito del dueño (18/08): **cada vendedor con su propio usuario**, nunca una cuenta
compartida. Sin eso se pierde justo lo que justifica el proyecto: saber quién atendió a quién.

Diseño del enganche en Delta:

- Puerto `IChatwootPort` con `createAgent()` / `disableAgent()`, y **adaptador `noop` por defecto**
  — exactamente el patrón del módulo de email (`EMAIL_DRIVER`), para que en local y en los tests no
  haya llamadas a la red.
- Variables: `CHATWOOT_ENABLED`, `CHATWOOT_BASE_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_API_TOKEN`
  (en Secret Manager, nunca en el repo).
- Enganches **best-effort** (`void ... .catch()`, nunca bloquean la operación principal) en el alta
  de vendedor de `/admin/sellers` y en la baja/deshabilitación.
- 🔴 **Dos directorios que se pueden desincronizar.** Este repo ya tiene historial de datos escritos
  en un lado y leídos en otro. La regla: **`profiles` manda, Chatwoot es un reflejo.** Y un vendedor
  dado de baja en Delta que siga leyendo conversaciones en Chatwoot es un problema real, no una
  molestia — la baja tiene que propagarse.

## 5. Riesgos que dependen de terceros

| Riesgo                                             | Qué hacer                                                                                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔴 **Cloud API de Meta para un número venezolano** | Ninguna fuente lo confirma **ni lo excluye**. Verificar con Meta **antes** de comprometer nada. Alternativa: registrar el número en Chile (decisión de negocio)              |
| 🟠 **Tarifas del 1/10/2026**                       | Los mensajes de servicio pasan a cobrarse por mensaje (~US$ 0,0068). Las respuestas humanas escritas **desde la app de WhatsApp Business** siguen gratis                     |
| 🟡 **Sector regulado**                             | Meta restringe salud y medicamentos. Presentarse como **software para consultorios**, no como prestador de salud. Cuidar la redacción del perfil comercial                   |
| 🟡 **Mantenimiento**                               | Chatwoot saca versiones seguido. Cuando falle un martes a las 11 de la noche, es nuestro. Es lo que se paga a cambio de los US$ 4/mes que se ahorran contra la nube de ellos |

## 6. Reparto de tareas

| Tarea                                                 | Quién                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Verificar disponibilidad de la Cloud API en Venezuela | **Dueño** (cuenta de Meta)                                                                                          |
| Cuenta de WhatsApp Business + número                  | **Dueño**                                                                                                           |
| Crear la VM y desplegar el stack                      | Lead — ⚠️ **el `gcloud` local está autenticado con otra cuenta**; hace falta que el dueño se autentique o dé acceso |
| DNS `chat.deltasalud.app` en Cloudflare               | Lead                                                                                                                |
| Respaldo a GCS                                        | Lead                                                                                                                |
| Puerto + adaptador Chatwoot y enganches de alta/baja  | `backend-agent`, **después** de que aterrice inventario (los dos tocan `app.module.ts`)                             |
