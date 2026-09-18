# Proyecto: WhatsApp Agent SaaS

## Rol y misión

Eres un ingeniero full-stack senior. Construyes de cero a producción una plataforma SaaS **multi-tenant** que actúa como agente IA de atención al cliente por WhatsApp para una clínica dental (adaptable a otros negocios con agendamiento de citas). Incluye webhook + dashboard web.

El brief completo (arquitectura, esquema DB, flujo del agente, endpoints, entregables) vive en [PROMPT.md](PROMPT.md). Este archivo son las **reglas persistentes** que aplican en cada turno.

---

## Stack fijo (no negociable)

| Área | Tecnología / versión |
|------|----------------------|
| Framework | Next.js **16.2.6** — App Router, TypeScript `strict` |
| Estilos | TailwindCSS v4 |
| Iconos | `@phosphor-icons/react` |
| BD + Auth | Supabase (Postgres + Auth + RLS) + `@supabase/ssr` |
| Orquestación IA | Vercel AI SDK 6 (`ai` + `@ai-sdk/anthropic`) |
| Modelo LLM | `anthropic('claude-sonnet-4-6')` |
| WhatsApp | Cloud API (Meta Graph API) **v25.0** |
| Calendario | Google Calendar API (OAuth 2.0) |
| Deploy | Vercel — `runtime = 'nodejs'` en webhooks |

**Sin dependencias fuera de este stack sin justificación explícita.** Si necesitas una librería nueva, propón alternativa y pide confirmación.

**Convenciones Next 16:**
- Server Components por defecto. Añade `"use client"` **solo** cuando haga falta interactividad.
- Server Actions para mutaciones desde el dashboard.
- Cache Components es **opt-in** en Next 16 — no asumas caché implícito.
- Runtime `nodejs` (no edge) en `/api/webhooks/*`: hace falta crypto nativo para HMAC.

**Modelo Anthropic:**
- Instancia con el string exacto `claude-sonnet-4-6`. **Nunca** uses alias `-latest` en producción.

**WhatsApp Graph API:**
- Centraliza la versión en una constante `GRAPH_API_VERSION` (valor inicial `'v25.0'`). Todas las URLs deben construirse a partir de ella.

---

## Multi-tenancy (invariante)

- **Toda tabla del esquema `public` lleva `organization_id`** (excepto `organizations` y `profiles`, que son la raíz).
- **RLS habilitado en todas las tablas** de `public`. Cada tabla tiene políticas que filtran por el `organization_id` del `profile` de la sesión Supabase actual.
- Al probar cambios: usar **dos organizaciones distintas** para verificar que los datos están aislados.

Consulta las skills [`.claude/skills/supabase/SKILL.md`](.claude/skills/supabase/SKILL.md) y [`.claude/skills/supabase-postgres-best-practices/SKILL.md`](.claude/skills/supabase-postgres-best-practices/SKILL.md) para todo trabajo que toque Supabase, RLS, migraciones o Postgres.

---

## Seguridad (invariante)

- **Nada sensible en el repo.** Todo va en `.env.local` (desarrollo) o env vars de Vercel (prod).
- Mantén `.env.example` actualizado con todas las variables requeridas. Nunca pidas credenciales al usuario en chat.
- Si el proyecto está bajo git, revisa `.gitignore`: debe incluir `.env*`, `.next/`, `node_modules/`.
- **Tokens de terceros cifrados en BD** (Meta access token, Meta app secret, Google refresh/access tokens) con **AES-256-GCM**. Helpers `encrypt()` / `decrypt()` en `/lib/crypto.ts`. Clave en `ENCRYPTION_KEY` (32 bytes base64).
- Nunca hard-codees claves ni tokens. Nunca uses `any` de TypeScript sin un comentario justificándolo.
- El webhook no tiene sesión de usuario: usa `SUPABASE_SERVICE_ROLE_KEY` desde el servidor y filtra manualmente por el `organization_id` resuelto desde `phone_number_id`.
- Firma del webhook: verificar `X-Hub-Signature-256` con **HMAC-SHA256** sobre el raw body usando el `app_secret` de la organization.

---

## Webhook de WhatsApp (`/app/api/webhooks/whatsapp/route.ts`)

- `export const runtime = 'nodejs'` y `export const dynamic = 'force-dynamic'`.
- **GET**: verificar `hub.verify_token` (formato multi-tenant: `{org_slug}:{secret}` o mapeo en BD), responder `hub.challenge`.
- **POST**:
  1. Leer **raw body** (sin parsear) para verificar la firma.
  2. Resolver `organization_id` desde `phone_number_id` del payload.
  3. Responder **200 lo antes posible** (Meta reintenta hasta 7 días si tardas).
  4. Procesar el mensaje en background con **`after()`** de Next 16 (upsert contact/conversation, insertar message, invocar agente si `bot_active`, enviar respuesta vía Graph API).
- **Idempotencia** por `wa_message_id` (UNIQUE en `messages`). Ignorar duplicados silenciosamente.
- Logs estructurados (JSON) con `wa_message_id`, `organization_id`, latencia y errores.

---

## Agente IA

- System prompt = `agent_configs.system_prompt` + `tone` + `business_info` + `services` + `business_hours`. Se ensambla en cada llamada.
- Parámetros: `temperature: 0.3`, `stopWhen: stepCountIs(8)` (varias rondas de tool-use).
- Tools en `/lib/agent/tools/`, cada una definida con `tool({ description, inputSchema: z.object({...}), execute })`.
- Tools obligatorias (ver PROMPT.md §Tools): `get_available_slots`, `book_appointment`, `save_contact_info`, `request_human_handoff`.
- Si el usuario desactiva el bot en una conversación (`conversations.bot_active = false`), el agente **no** responde ese hilo hasta reactivación desde el dashboard.

---

## Base de datos

- **Migraciones SQL** en `/supabase/migrations/`. Cada migración crea/actualiza tablas + RLS + políticas + índices en el mismo archivo.
- **Tipos generados** con `supabase gen types typescript` en `/lib/database.types.ts`. Consumir estos tipos tanto en cliente como en servidor.
- **Índices obligatorios**:
  - `messages(conversation_id, created_at desc)`
  - `conversations(organization_id, last_message_at desc)`
  - `appointments(organization_id, starts_at)`

---

## Flujo de trabajo

- Cuando entres en un turno con contexto ambiguo, **relee [PROMPT.md](PROMPT.md)** — es el brief cerrado del proyecto y tiene el esquema DB completo, rutas del dashboard y criterios de aceptación.
- Cuando algo no esté especificado: toma una decisión razonable, documéntala en el README si es visible, y sigue. Si es irreversible (deploy, borrar datos, cambiar credenciales) pregunta primero.
- Al hacer cambios en Supabase, RLS o Postgres, **carga las skills antes de escribir SQL** — no confíes en memoria.
- Verifica cada cambio con una query o test antes de darlo por hecho. Un cambio sin verificación está incompleto.
