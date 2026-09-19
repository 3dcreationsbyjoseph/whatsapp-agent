// Procesamiento asíncrono del webhook: llamado desde after() del route handler.
// Puede tardar segundos: llama a Claude, envía respuesta por WhatsApp.

import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { sendWhatsAppText } from "@/lib/whatsapp/send";
import { runAgent } from "@/lib/agent/run-agent";
import type { GCalConfig } from "@/lib/google/calendar";

type MetaMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
};

type MetaChange = {
  field: string;
  value: {
    messaging_product: string;
    metadata: { phone_number_id: string; display_phone_number: string };
    contacts?: Array<{ profile: { name: string }; wa_id: string }>;
    messages?: MetaMessage[];
  };
};

type MetaWebhookPayload = {
  object: string;
  entry: Array<{ id: string; changes: MetaChange[] }>;
};

export async function processWebhook(payload: MetaWebhookPayload): Promise<void> {
  const admin = createAdminClient();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const phoneNumberId = change.value.metadata.phone_number_id;

      const { data: wa } = await admin
        .from("whatsapp_configs")
        .select("organization_id, access_token_encrypted, phone_number_id")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (!wa) {
        console.warn(JSON.stringify({ level: "warn", msg: "unknown phone_number_id", phoneNumberId }));
        continue;
      }
      const organization_id = wa.organization_id;

      const { data: org } = await admin
        .from("organizations")
        .select("timezone")
        .eq("id", organization_id)
        .single();
      const timezone = org?.timezone ?? "America/Mexico_City";

      for (const m of change.value.messages ?? []) {
        if (m.type !== "text" || !m.text) continue;

        // Upsert contact
        const { data: contact } = await admin
          .from("contacts")
          .upsert(
            { organization_id, wa_phone: m.from },
            { onConflict: "organization_id,wa_phone", ignoreDuplicates: false },
          )
          .select("id, full_name, is_new_patient")
          .single();
        if (!contact) continue;

        // Upsert conversation
        const { data: conv } = await admin
          .from("conversations")
          .upsert(
            {
              organization_id,
              contact_id: contact.id,
              last_message_at: new Date().toISOString(),
            },
            { onConflict: "organization_id,contact_id", ignoreDuplicates: false },
          )
          .select("id, bot_active")
          .single();
        if (!conv) continue;

        // Insertar mensaje entrante (idempotente por wa_message_id UNIQUE)
        const { error: insErr } = await admin.from("messages").insert({
          conversation_id: conv.id,
          organization_id,
          wa_message_id: m.id,
          direction: "inbound",
          sender: "contact",
          content: m.text.body,
          raw: m as unknown as Record<string, unknown>,
        });
        if (insErr) {
          if (insErr.code === "23505") {
            // duplicado: ya lo procesamos. skip.
            continue;
          }
          console.error(JSON.stringify({ level: "error", msg: "insert message failed", err: insErr.message }));
          continue;
        }

        if (!conv.bot_active) continue;

        // Ejecutar agente
        try {
          const { data: agentCfg } = await admin
            .from("agent_configs")
            .select("system_prompt, tone, business_info, services, business_hours, handoff_message")
            .eq("organization_id", organization_id)
            .single();
          if (!agentCfg) continue;

          const { data: gcalRow } = await admin
            .from("google_calendar_configs")
            .select("organization_id, calendar_id, refresh_token_encrypted, access_token_encrypted, token_expires_at")
            .eq("organization_id", organization_id)
            .maybeSingle();
          const gcal: GCalConfig | null = gcalRow ?? null;

          // Últimos 20 mensajes en orden ascendente (evita que un historial largo
          // confunda al modelo con contexto viejo tras completar acciones).
          const { data: history } = await admin
            .from("messages")
            .select("direction, sender, content, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(20);

          const chat_history = (history ?? [])
            .filter((h) => h.content)
            .reverse()
            .map((h) => ({
              role: h.direction === "inbound" ? ("user" as const) : ("assistant" as const),
              content: h.content!,
            }));

          const { data: orgRow } = await admin
            .from("organizations")
            .select("name")
            .eq("id", organization_id)
            .single();

          const start = Date.now();
          const { text } = await runAgent({
            organization_id,
            organization_name: orgRow?.name ?? "",
            timezone,
            conversation_id: conv.id,
            contact_id: contact.id,
            contact_phone: m.from,
            phone_number_id: wa.phone_number_id,
            access_token: decrypt(wa.access_token_encrypted),
            agent_config: agentCfg,
            gcal_config: gcal,
            chat_history,
          });
          const latency_ms = Date.now() - start;

          // Re-lee bot_active: la tool `request_human_handoff` puede haberlo apagado.
          const { data: convAfter } = await admin
            .from("conversations")
            .select("bot_active")
            .eq("id", conv.id)
            .single();

          const accessToken = decrypt(wa.access_token_encrypted);
          const reply = text?.trim() || (convAfter && !convAfter.bot_active
            ? agentCfg.handoff_message ?? "Te paso con un humano en un momento."
            : "");

          if (reply) {
            const send = await sendWhatsAppText(wa.phone_number_id, accessToken, m.from, reply);
            if (!send.ok) {
              // Meta rechazó el envío (401/token, plantilla requerida fuera de la ventana, etc.).
              // No guardamos el mensaje como si hubiera llegado — logueamos y salimos.
              console.error(
                JSON.stringify({
                  level: "error",
                  msg: "outbound send failed",
                  organization_id,
                  wa_message_id: m.id,
                  err: send.error,
                }),
              );
              return;
            }
            await admin.from("messages").insert({
              conversation_id: conv.id,
              organization_id,
              wa_message_id: send.message_id ?? null,
              direction: "outbound",
              sender: "bot",
              content: reply,
              raw: null,
            });
            await admin
              .from("conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", conv.id);
          }

          console.log(
            JSON.stringify({
              level: "info",
              msg: "agent turn completed",
              organization_id,
              wa_message_id: m.id,
              latency_ms,
              replied: reply.length > 0,
            }),
          );
        } catch (err) {
          console.error(
            JSON.stringify({
              level: "error",
              msg: "agent turn failed",
              organization_id,
              wa_message_id: m.id,
              err: (err as Error).message,
            }),
          );
        }
      }
    }
  }
}
