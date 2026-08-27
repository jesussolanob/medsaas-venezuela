# 12 — Plan: WhatsApp con IA + traspaso a ejecutivo (post-venta y ventas)

> Investigación y decisión de plataforma del **2026-08-18**. Estado: **decidido, sin implementar**.
> Objetivo: que un médico le escriba al WhatsApp de Delta, **una IA le responda primero** con
> conocimiento real de la aplicación, y si pide hablar con una persona, **un ejecutivo entre en la
> misma conversación**.

---

## 1 · El hallazgo que reordena el esfuerzo

**El cerebro ya existe.** En `apps/backend/src/modules/help-assistant` hay un asistente con Gemini,
vivo en producción, que ya conoce la aplicación:

- **1.491 líneas de guías curadas** (`guides/`): especialista, paciente y super admin
- **Protección contra inyección de prompt ya implementada** (`build-help-prompt.ts` neutraliza
  delimitadores `===` y turnos falsos tipo `Usuario:` / `Asistente:`)
- Consciente del **rol y del plan** de quien pregunta
- Caso de uso, controlador y adaptador de Gemini funcionando

**WhatsApp no es un proyecto de IA: es un canal nuevo para un asistente que ya existe.**

### Lo que falta de verdad

| Pieza                                      | Estado                                                                                                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El cerebro                                 | ✅ existe                                                                                                                                                                                                |
| El transporte (WhatsApp)                   | ❌ falta                                                                                                                                                                                                 |
| La bandeja donde el ejecutivo toma el chat | ❌ falta                                                                                                                                                                                                 |
| **Variante para leads**                    | ❌ falta — `help-chat.controller.ts` exige `AppAuthGuard` y elige guía por rol. **Un médico que todavía no es cliente no tiene cuenta.** Hace falta una cuarta guía comercial y un camino sin autenticar |

---

## 2 · Plataforma elegida: Chatwoot autohospedado

### Las opciones que se evaluaron

| Plataforma      | Veredicto                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Chatwoot**    | ✅ **Elegida.** Open source, canal WhatsApp por Cloud API oficial, traspaso a humano en el mismo hilo, y **el bot puede ser el tuyo**                                                            |
| **Respond.io**  | Llave en mano y hace las tres cosas, pero **US$ 199/mes** (10 usuarios) y **su IA nunca va a saber que a ese médico le quedan 3 días de prueba**. Se descarta: ya tenemos algo mejor             |
| **Wati**        | ❌ Descartada: **su IA no puede derivar a un agente humano**. Falla el requisito central                                                                                                         |
| **Twilio Flex** | ❌ Descartada: implementación desde **US$ 10.000**, US$ 35–150 por usuario/mes, y "casi cualquier cambio necesita un desarrollador". Es para call centers de cientos de agentes                  |
| **FeelSocial**  | ❌ Descartada: contact center omnicanal **sin precios públicos** (venta consultiva) y con IA genérica de preguntas frecuentes                                                                    |
| **n8n**         | No para el núcleo. Quedaría **entre dos sistemas que ya hablan HTTP**, sumando un servicio más para hospedar. Solo se justifica si el equipo comercial quiere editar flujos sin un desarrollador |

### Verificado en el código de Chatwoot, no en su web

Las páginas de terceros se contradecían, así que se revisó el repositorio. Lo de pago vive en una
carpeta `enterprise/` aparte:

| Pieza                            | Ubicación     | ¿Gratis autohospedado?             |
| -------------------------------- | ------------- | ---------------------------------- |
| `app/models/channel/whatsapp.rb` | comunitario   | ✅ **sí**                          |
| `app/models/agent_bot.rb`        | comunitario   | ✅ **sí**                          |
| `captain` (la IA de ellos)       | `enterprise/` | ❌ de pago — **no la necesitamos** |
| SLA, SAML, roles, campañas       | `enterprise/` | ❌ de pago                         |

**Las dos piezas que hacen falta están en la parte libre.** Lo que queda del otro lado del muro es
justamente la IA que no vamos a usar.

⚠️ **En la nube de ellos es distinto:** el plan gratis (_Hacker_) son 2 agentes y **solo chat web,
sin WhatsApp**. WhatsApp arranca en _Startups_, **US$ 19 por agente/mes**.

---

## 3 · Cómo funciona el traspaso (documentación oficial)

Tres estados, y el cliente nunca cambia de hilo:

| Estado                 | Qué pasa                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| **`pending`**          | Arranca acá cuando hay un bot activo. **El bot atiende y clasifica**                      |
| **`open`**             | El bot cambia el estado por API → **la conversación cae en la bandeja de los ejecutivos** |
| **`pending`** otra vez | El ejecutivo **devuelve el chat al bot** cuando resolvió lo suyo                          |

> _"El traspaso ocurre dentro del mismo hilo. El cliente continúa en el mismo hilo — no hay cambio
> de hilo. Desde su perspectiva, la conversación simplemente pasa de respuestas del bot a
> respuestas de un agente humano."_ — documentación de Chatwoot

```
Médico (WhatsApp) ←→ número de Delta ←→ Chatwoot ←→ ejecutivo (usuario propio)
        ↑                                    ↑
  ve UN solo chat              bot primero, humano después
```

**El ejecutivo NO recibe nada en su WhatsApp personal.** Entra a Chatwoot con su usuario, desde el
navegador o desde la **app móvil de Chatwoot** (iOS y Android, funciona contra instalación propia,
con notificaciones push).

### Lo que gana el negocio con esto

- El médico **nunca ve el celular personal** del vendedor
- Si el vendedor se va, **la conversación y el historial se quedan**: no se lleva la cartera
- Varios ejecutivos sobre el mismo número **sin pisarse**, porque hay asignación
- Queda registro de qué se conversó, cuánto se tardó y cómo se cerró

---

## 4 · Usuarios de los vendedores (pedido del dueño, 2026-08-18)

**Cada vendedor debe tener su propio usuario en Chatwoot.** No se comparte una cuenta.

### Por qué importa más de lo que parece

Sin usuarios propios se pierde exactamente lo que justifica el proyecto: **saber quién atendió a
quién**. Una cuenta compartida deja las conversaciones sin dueño, hace imposible la asignación y
borra la trazabilidad comercial.

### Lo que hay que resolver

1. **Alta.** Cuando un `super_admin` da de alta un vendedor en `/admin/sellers`, ese vendedor
   necesita también su usuario de Chatwoot. Chatwoot tiene API de agentes
   (`POST /api/v1/accounts/{id}/agents`), así que se puede automatizar.
2. **Baja.** Si el vendedor se desactiva en Delta, **hay que desactivarlo en Chatwoot**. Un vendedor
   dado de baja que siga leyendo conversaciones es un problema real.
3. ⚠️ **Dos directorios que se pueden desincronizar.** Este repo ya tiene historial de datos que se
   escriben en un lado y se leen en otro (ver [código completo que nadie llama]). **Decidir
   explícitamente quién es la fuente de verdad: `profiles` de Delta.** Chatwoot es un reflejo.

### La oportunidad: cerrar el círculo con la atribución

El vendedor ya tiene **código y enlace público** (`/r/<CODIGO>`, ADR-037). Cuando toma un chat,
puede mandar **su propio enlace ahí mismo**, y la atribución viaja por el mecanismo que ya existe
(`profiles.sold_by`, que se escribe una sola vez y está garantizado en la BD).

**Idea para una etapa posterior, no para el arranque:** si el lead llegó por `/r/PUHPS5`, la
conversación de WhatsApp debería **asignarse automáticamente a ese vendedor**. Chatwoot permite
atributos personalizados y asignación por API. Cierra el círculo entre el enlace y la conversación.

---

## 5 · Costos

**Los mensajes de WhatsApp cuestan lo mismo en las dos opciones** — no distinguen. Desde el
1/10/2026, ~US$ 0,0068 por mensaje de servicio: con 100 conversaciones al mes de 10 mensajes son
**~US$ 7/mes**.

|                               | **Autohospedado**          | **Nube de Chatwoot** |
| ----------------------------- | -------------------------- | -------------------- |
| Licencia                      | $0                         | US$ 19 por agente    |
| VM `e2-medium` (2 vCPU, 4 GB) | US$ 24,46                  | —                    |
| Disco 60 GB                   | ~US$ 6                     | —                    |
| IP fija                       | ~US$ 3,65                  | —                    |
| Postgres + Redis              | $0 (contenedores en la VM) | —                    |
| **2 ejecutivos**              | **≈ US$ 34**               | **US$ 38**           |
| 3 ejecutivos                  | ≈ US$ 34                   | US$ 57               |
| 5 ejecutivos                  | ≈ US$ 34                   | US$ 95               |
| 10 ejecutivos                 | ≈ US$ 40 (VM mayor)        | US$ 190              |

**Con dos ejecutivos el ahorro es de US$ 4/mes: no es una decisión de plata.** Se elige
autohospedado por otras tres razones:

1. **No escala con la gente.** Pagar por agente castiga justo lo que se quiere hacer crecer.
2. **El historial comercial queda en la nube propia** — argumento real con las auditorías chilenas
   en el horizonte (ADR-040).
3. **No hay migración después.** Arrancar en la nube de ellos y mudarse a los seis meses es trabajo
   evitable.

⚠️ Lo que se paga a cambio de esos US$ 4 es **trabajo de mantenimiento**: Chatwoot saca versiones
seguido, hay que actualizar, respaldar y vigilar. Cuando falle un martes a las 11 de la noche, es
nuestro.

---

## 6 · Infraestructura

### ⚠️ Chatwoot NO va en Cloud Run

El instinto va a ser desplegarlo como todo lo demás. **No funciona bien:**

1. **Sidekiq** (tareas en segundo plano) **tiene que correr siempre**. Con `min-instances=0`, que es
   como está todo hoy, se apaga y **los mensajes de WhatsApp quedan encolados sin procesar**.
2. Usa **websockets** (ActionCable) para el tiempo real de la bandeja.
3. Es un monolito de Rails con estado, no una API de pedido y respuesta.

Ponerlo con `min-instances=1` cuesta lo mismo que una VM y pelea con el diseño.

**Camino correcto: una VM con Docker Compose** — Postgres, Redis, Rails y Sidekiq en el mismo
`docker-compose`. Es el camino documentado.

### Requisitos oficiales

| Componente                 | Requisito                                                             |
| -------------------------- | --------------------------------------------------------------------- |
| CPU / RAM                  | 4 vCPU y 4 GB (oficial); con 2 vCPU y 4 GB alcanza para 15–20 agentes |
| Disco                      | ~60 GB SSD                                                            |
| PostgreSQL                 | 14+ — **única base soportada**                                        |
| Redis                      | 7.0+ — **obligatorio**, mueve la cola                                 |
| Almacenamiento de archivos | Opcional (sirve GCS)                                                  |
| SMTP                       | Para invitar agentes y notificar                                      |
| Dominio con HTTPS          | Necesario para el webhook de Meta y para la app móvil                 |

### Lo que ya tenemos y lo que falta

|                                              | Estado                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Proyecto GCP y facturación                   | ✅                                                                                                            |
| Dominio + Cloudflare (`chat.deltasalud.app`) | ✅ camino conocido                                                                                            |
| SMTP                                         | ✅ **Resend** ya configurado                                                                                  |
| Almacenamiento                               | ✅ **GCS** ya en uso                                                                                          |
| PostgreSQL                                   | ⚠️ hay Cloud SQL, pero **conviene el contenedor de la VM**: separado, sin tocar la base de pacientes          |
| **Redis**                                    | ❌ **falta** — está apagado (`REDIS_DISABLED=true`). Va como contenedor, **no hace falta Memorystore** (caro) |
| **La VM**                                    | ❌ falta crearla                                                                                              |

---

## 7 · Etapas

### Etapa 0 — Mover Gemini a Vertex AI 🔴 **BLOQUEANTE**

Hoy el asistente corre sobre el **nivel gratuito de Gemini, que entrena con lo que recibe** (ya
estaba anotado como interino). En el widget web el daño está acotado; **en WhatsApp no**: un médico
va a pegar el nombre de un paciente, una cédula o un diagnóstico, tarde o temprano.

**Se mueve antes de abrir el canal, no después.** Mismo proyecto GCP y los datos no se usan para
entrenar.

### Etapa 1 — Probar que la IA vende (2 días, sin infraestructura)

Número de prueba con Cloud API + **coexistencia** + el asistente que ya existe, con la guía
comercial nueva. **Sin panel, sin Chatwoot, sin traspaso automático**: el ejecutivo responde desde
la app de WhatsApp Business.

Responde la única pregunta cara: **¿las respuestas sirven para vender?** Si no, se tiran dos días
de trabajo y no una plataforma montada.

> **Coexistencia** (Meta, desde mayo 2025): el mismo número puede estar a la vez en la app de
> WhatsApp Business y en la Cloud API, con los mensajes espejados en ambos sentidos.
> **Las respuestas humanas escritas desde la app no se cobran nunca.**

### Etapa 2 — Montar Chatwoot

1. VM `e2-medium`, Ubuntu 22.04, disco de 60 GB
2. Docker + Docker Compose con el stack oficial
3. `chat.deltasalud.app` por Cloudflare, con HTTPS
4. Correo saliente con las credenciales de Resend
5. **Usuarios de los ejecutivos y de cada vendedor** (sección 4)
6. Conectar WhatsApp: Business Account ID, Phone Number ID y token permanente
7. Enganchar el backend como **AgentBot** por webhook

Los pasos 1 a 5 son infraestructura y los podemos hacer nosotros. **El 6 depende de Meta.**

### Etapa 3 — Cerrar el círculo comercial

Asignación automática de la conversación al vendedor que originó el lead, y datos del médico
(plan, días de prueba, onboarding a medias) visibles en la ficha de Chatwoot.

---

## 8 · Riesgos y pendientes

| Riesgo                                           | Detalle                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🔴 **PII en el nivel gratuito de Gemini**        | Bloqueante. Ver Etapa 0                                                                                                                                                                                                                          |
| 🟠 **Disponibilidad en Venezuela sin confirmar** | Ninguna fuente lista a Venezuela entre los países soportados de la Cloud API; tampoco dice que esté excluido. **Verificar con Meta antes de comprometer nada.** Alternativa: registrar el número en Chile (decisión de negocio)                  |
| 🟠 **Cambio de precio el 1/10/2026**             | Los mensajes de servicio pasan a cobrarse por mensaje. Meta publica tarifas por país el 1/9. Las respuestas humanas **desde la app** siguen gratis                                                                                               |
| 🟡 **Sector regulado**                           | Meta restringe salud y medicamentos. Se resuelve presentándose como **software para consultorios**, no como prestador de salud. Cuidar la redacción del perfil comercial                                                                         |
| 🟡 **Respaldos**                                 | Si la VM se pierde, se pierde el historial comercial. **Respaldo automático del volumen de Postgres a GCS desde el día uno**                                                                                                                     |
| 🟡 **Chile**                                     | Chatwoot maneja **varias bandejas en una instalación**: un mismo Chatwoot puede atender el número venezolano y el chileno. Son conversaciones comerciales, no datos clínicos, así que no choca con el ADR-040 — pero que sea decisión consciente |

---

## 9 · Fuentes

- [Meta — precios de WhatsApp](https://developers.facebook.com/docs/whatsapp/pricing)
- [Cambio de octubre 2026](https://chakrahq.com/article/whatsapp-api-pricing-update-service-messages-october-2026/) ·
  [Nordflux](https://nordflux.de/en/insights/whatsapp-business-api-pricing-october-2026)
- [Coexistencia app + API](https://eazybe.com/blog/whatsapp-coexistence)
- [Chatwoot — precios](https://www.chatwoot.com/pricing) ·
  [traspaso a humano](https://www.chatwoot.com/hc/user-guide/articles/1677497472-how-to-use-agent-bots) ·
  [canal WhatsApp](https://www.chatwoot.com/hc/user-guide/articles/1677832735-how-to-setup-a-whats_app-channel) ·
  [requisitos](https://developers.chatwoot.com/self-hosted/deployment/requirements) ·
  [apps móviles](https://www.chatwoot.com/mobile-apps)
- [Twilio Flex — precios](https://www.twilio.com/en-us/flex/pricing) ·
  [costo real](https://www.cloudtalk.io/blog/twilio-flex-pricing/)
- [Wati vs Respond.io](https://respond.io/blog/wati-vs-respondio) · [FeelSocial](https://feelsocial.cx/)
- [GCP — precio `e2-medium`](https://www.economize.cloud/resources/gcp/pricing/compute-engine/e2-medium/)
