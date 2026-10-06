// Procesamiento asíncrono del webhook: llamado desde after() del route handler.
// Puede tardar segundos: llama a Claude, envía respuesta por WhatsApp.

import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { downloadWhatsAppMedia, sendTypingIndicator, sendWhatsAppText, sendWhatsAppVoice } from "@/lib/whatsapp/send";
import { speechEnabled, synthesizeVoiceNote, textForSpeech, transcribeVoiceNote } from "@/lib/speech/google";
import { detectLanguageLocal } from "@/lib/lang-detect";
import { allowedLanguage } from "@/lib/billing/plans";
import { runAgent } from "@/lib/agent/run-agent";
import { buildContactContext, type LeadSummary } from "@/lib/agent/system-prompt";
import { FICHA_PREFIX, parseFicha } from "@/lib/agent/tools/send-property-to-client";
import { visitLabel } from "@/lib/agent/tools/list-upcoming-appointments";
import { translateForClient } from "@/lib/agent/translate";
import { cleanName, hasFullName, isRealName, readMetadata } from "@/lib/contact-info";
import { DEFAULT_TIMEZONE, formatInTz } from "@/lib/format-date";
import type { Json } from "@/lib/database.types";
import { getOrgBilling } from "@/lib/billing/access";
import { DEFAULT_HANDOFF_MESSAGE } from "@/lib/agent/tools/request-human-handoff";
import type { GCalConfig } from "@/lib/google/calendar";

type MetaMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  // Notas de voz y audios (type "audio").
  audio?: { id: string; mime_type?: string; voice?: boolean };
};

// Texto con el que se guarda una nota de voz hasta transcribirla (o si no se puede).
const VOICE_PLACEHOLDER = "🎤 [nota de voz]";

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
        .select("timezone, name")
        .eq("id", organization_id)
        .single();
      const timezone = org?.timezone ?? DEFAULT_TIMEZONE;

      for (const m of change.value.messages ?? []) {
        const isVoice = m.type === "audio" && !!m.audio?.id;
        if (!isVoice && (m.type !== "text" || !m.text)) continue;
        const receivedAt = Date.now();
        // Texto del mensaje (en notas de voz, la transcripción cuando la haya).
        let incomingText = m.text?.body ?? VOICE_PLACEHOLDER;

        // Upsert contact
        const { data: contact } = await admin
          .from("contacts")
          .upsert(
            { organization_id, wa_phone: m.from },
            { onConflict: "organization_id,wa_phone", ignoreDuplicates: false },
          )
          .select("id, full_name, is_new_patient, metadata, created_at")
          .single();
        if (!contact) continue;
        const contactMeta = readMetadata(contact.metadata);

        // Nombre del perfil de WhatsApp: solo si es un nombre real (no ".", emojis...)
        // y el contacto no tiene ya uno válido. Queda marcado como "whatsapp" para
        // que el nombre que dé el cliente (save_contact_info) lo sustituya.
        const profileName = cleanName(
          change.value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name,
        );
        if (profileName && !isRealName(contact.full_name)) {
          const metadata = { ...contactMeta, name_source: "whatsapp" as const };
          await admin
            .from("contacts")
            .update({ full_name: profileName, metadata: metadata as Json })
            .eq("id", contact.id)
            .eq("organization_id", organization_id);
          contact.full_name = profileName;
          Object.assign(contactMeta, metadata);
        }

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
          content: incomingText,
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

        const accessToken = decrypt(wa.access_token_encrypted);

        // Todo lo que necesita el agente, en paralelo (antes eran ~10 consultas en serie).
        type Prop = { title: string; reference: string | null };
        const [
          billing,
          { count: olderContacts },
          { data: agentCfg },
          { data: gcalRow },
          { data: history },
          { data: lead },
          { data: fichas },
          { data: visits },
        ] = await Promise.all([
          getOrgBilling(organization_id),
          admin
            .from("contacts")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organization_id)
            .lt("created_at", contact.created_at),
          admin
            .from("agent_configs")
            .select("system_prompt, tone, business_info, services, business_hours, handoff_message")
            .eq("organization_id", organization_id)
            .single(),
          admin
            .from("google_calendar_configs")
            .select("organization_id, calendar_id, refresh_token_encrypted, access_token_encrypted, token_expires_at")
            .eq("organization_id", organization_id)
            .maybeSingle(),
          // Últimos 20 mensajes (evita que un historial largo confunda al modelo).
          admin
            .from("messages")
            .select("direction, sender, content, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(20),
          // Lo ya sabido del cliente (el historial que ve el modelo es corto):
          // criterios del lead, fichas enviadas y visitas próximas.
          admin
            .from("leads")
            .select(
              "budget_min_eur, budget_max_eur, preferred_locations, preferred_types, min_bedrooms, min_bathrooms, needs_pool, needs_sea_view, timeline, financing, language, notes",
            )
            .eq("organization_id", organization_id)
            .eq("contact_id", contact.id)
            .maybeSingle<LeadSummary>(),
          admin
            .from("messages")
            .select("content")
            .eq("conversation_id", conv.id)
            .eq("direction", "outbound")
            .like("content", `${FICHA_PREFIX}%`)
            .order("created_at", { ascending: true })
            .limit(50),
          admin
            .from("appointments")
            .select("starts_at, visit_type, property:properties(title, reference)")
            .eq("organization_id", organization_id)
            .eq("contact_id", contact.id)
            .eq("status", "confirmed")
            .gte("starts_at", new Date().toISOString())
            .order("starts_at", { ascending: true })
            .limit(5)
            .returns<Array<{ starts_at: string; visit_type: string | null; property: Prop | Prop[] | null }>>(),
        ]);

        // Sin prueba vigente ni suscripción activa: guardamos el mensaje pero no respondemos.
        if (!billing.hasAccess) {
          console.log(
            JSON.stringify({
              level: "info",
              msg: "agent skipped: no billing access",
              organization_id,
              wa_message_id: m.id,
              billing_status: billing.status,
            }),
          );
          continue;
        }

        // Límite de clientes del plan: se atiende a los N clientes más antiguos.
        // Si la agencia borra clientes, los siguientes vuelven a recibir respuesta.
        // El mensaje queda guardado igualmente (el equipo lo ve en el panel).
        const plan = billing.plan;
        if (plan.maxContacts != null && (olderContacts ?? 0) >= plan.maxContacts) {
          console.log(
            JSON.stringify({
              level: "info",
              msg: "agent skipped: plan contact limit",
              organization_id,
              wa_message_id: m.id,
              plan: plan.id,
              max_contacts: plan.maxContacts,
            }),
          );
          continue;
        }

        // "Escribiendo…" en el móvil del cliente mientras se prepara la respuesta.
        const typing = sendTypingIndicator(wa.phone_number_id, accessToken, m.id);

        // Notas de voz: solo el plan Max las transcribe (Google Speech-to-Text).
        let voiceStatus: "transcribed" | "unavailable" | null = null;
        let voiceLanguage: string | null = null;
        if (isVoice) {
          voiceStatus = "unavailable";
          if (plan.audio && speechEnabled()) {
            try {
              const bytes = await downloadWhatsAppMedia(m.audio!.id, accessToken);
              const tr = await transcribeVoiceNote(bytes, lead?.language);
              if (tr) {
                incomingText = tr.text;
                voiceLanguage = tr.language;
                voiceStatus = "transcribed";
                // El panel muestra la transcripción en la conversación.
                await admin
                  .from("messages")
                  .update({ content: `🎤 ${tr.text}` })
                  .eq("wa_message_id", m.id)
                  .eq("organization_id", organization_id);
              }
            } catch (err) {
              console.warn(
                JSON.stringify({ level: "warn", msg: "voice note transcription failed", organization_id, wa_message_id: m.id, err: (err as Error).message }),
              );
            }
          }
        }

        // Idioma de la respuesta, decidido en código (sin IA): el del mensaje si se
        // reconoce; si no (p. ej. "ok", "Una villa"), el último conocido del cliente.
        // Si el plan no incluye ese idioma, se responde en inglés.
        const detected = voiceLanguage ?? (voiceStatus === "unavailable" ? null : detectLanguageLocal(incomingText));
        const clientLanguage = detected ?? lead?.language ?? null;
        const replyLanguage = clientLanguage ? allowedLanguage(clientLanguage, plan) : null;
        const languageOutOfPlan = !!clientLanguage && replyLanguage !== clientLanguage;
        // Se recuerda el idioma del cliente para próximos mensajes (en paralelo).
        const saveLanguage =
          detected && detected !== lead?.language
            ? admin
                .from("leads")
                .upsert(
                  { organization_id, contact_id: contact.id, language: detected },
                  { onConflict: "organization_id,contact_id", ignoreDuplicates: false },
                )
                .then(() => undefined)
            : Promise.resolve();

        // Ejecutar agente
        try {
          if (!agentCfg) continue;
          const gcal: GCalConfig | null = gcalRow ?? null;

          // Fuera del historial: logs "[debug]" (no son mensajes) y las URLs de
          // cada foto, que se resumen en una línea "[N fotos enviadas]".
          const chat_history: Array<{ role: "user" | "assistant"; content: string }> = [];
          let pendingPhotos = 0;
          const flushPhotos = () => {
            if (pendingPhotos > 0) {
              chat_history.push({ role: "assistant", content: `[${pendingPhotos} fotos enviadas]` });
              pendingPhotos = 0;
            }
          };
          for (const h of (history ?? []).slice().reverse()) {
            const content = h.content?.trim();
            if (!content || content.startsWith("[debug]")) continue;
            if (h.direction !== "inbound" && content.startsWith("[imagen] ")) {
              pendingPhotos++;
              continue;
            }
            flushPhotos();
            chat_history.push({
              role: h.direction === "inbound" ? "user" : "assistant",
              content,
            });
          }
          flushPhotos();
          // La nota de voz llega al modelo como su transcripción.
          if (voiceStatus === "transcribed") {
            for (let i = chat_history.length - 1; i >= 0; i--) {
              const h = chat_history[i];
              if (h.role === "user" && (h.content === VOICE_PLACEHOLDER || h.content === `🎤 ${incomingText}`)) {
                h.content = `(nota de voz) ${incomingText}`;
                break;
              }
            }
          }

          const sentProperties = new Map<string, Prop>();
          for (const f of fichas ?? []) {
            const p = parseFicha(f.content);
            if (p) sentProperties.set(p.reference ?? p.title, p);
          }
          const upcomingVisits = (visits ?? []).map((v) => {
            const p = Array.isArray(v.property) ? v.property[0] : v.property;
            return {
              local: formatInTz(v.starts_at, timezone, "long"),
              visit: visitLabel(v.visit_type),
              property: p ? (p.reference ? `${p.title} (Ref. ${p.reference})` : p.title) : null,
            };
          });

          const start = Date.now();
          const { text } = await runAgent({
            organization_id,
            organization_name: org?.name ?? "",
            timezone,
            conversation_id: conv.id,
            contact_id: contact.id,
            contact_phone: m.from,
            phone_number_id: wa.phone_number_id,
            access_token: accessToken,
            reply_language: replyLanguage,
            agent_config: agentCfg,
            gcal_config: gcal,
            plan,
            chat_history,
            contact_context: buildContactContext({
              full_name: cleanName(contact.full_name),
              name_from_whatsapp: contactMeta.name_source === "whatsapp",
              contact_phone: contactMeta.contact_phone ?? null,
              email: contactMeta.email ?? null,
              email_declined: contactMeta.email_declined === true,
              wa_phone: m.from,
              has_full_name: hasFullName(contact.full_name) || contactMeta.name_confirmed === true,
              lead: lead ?? null,
              sent_properties: [...sentProperties.values()],
              upcoming_visits: upcomingVisits,
              reply_language: replyLanguage,
              client_language: clientLanguage,
              language_out_of_plan: languageOutOfPlan,
              voice_note: voiceStatus,
            }),
          });
          const latency_ms = Date.now() - start;

          // Re-lee bot_active: la tool `request_human_handoff` puede haberlo apagado.
          const { data: convAfter } = await admin
            .from("conversations")
            .select("bot_active")
            .eq("id", conv.id)
            .single();

          // Si hubo handoff en este turno se envía siempre el mensaje configurado
          // en Personalización (no el texto libre del modelo).
          const handedOff = convAfter ? !convAfter.bot_active : false;
          // El mensaje de handoff está escrito en Personalización (normalmente en
          // español): se traduce al idioma de los últimos mensajes del cliente.
          const clientSample = chat_history
            .filter((h) => h.role === "user")
            .slice(-3)
            .map((h) => h.content)
            .join("\n");
          const reply = handedOff
            ? await translateForClient(
                agentCfg.handoff_message?.trim() || DEFAULT_HANDOFF_MESSAGE,
                replyLanguage ? { language: replyLanguage } : { sample: clientSample },
                plan,
              )
            : text?.trim() ?? "";

          // Si el cliente habló por nota de voz (y su plan incluye audio), se responde
          // con otra nota de voz. Los enlaces van además por escrito. Si la voz falla,
          // se envía el texto como siempre.
          let sentVoice = false;
          if (reply && voiceStatus === "transcribed") {
            try {
              const spoken = textForSpeech(reply);
              if (spoken) {
                const audio = await synthesizeVoiceNote(spoken, replyLanguage);
                const v = await sendWhatsAppVoice(wa.phone_number_id, accessToken, m.from, audio);
                if (v.ok) {
                  sentVoice = true;
                  await admin.from("messages").insert({
                    conversation_id: conv.id,
                    organization_id,
                    wa_message_id: v.message_id ?? null,
                    direction: "outbound",
                    sender: "bot",
                    content: `🔊 ${reply}`,
                    raw: null,
                  });
                } else {
                  console.warn(JSON.stringify({ level: "warn", msg: "voice reply send failed", organization_id, err: v.error }));
                }
              }
            } catch (err) {
              console.warn(JSON.stringify({ level: "warn", msg: "voice reply failed; sending text", organization_id, err: (err as Error).message }));
            }
          }
          const links = reply.match(/https?:\/\/\S+/g) ?? [];
          const textToSend = sentVoice ? links.join("\n") : reply;

          if (textToSend) {
            const send = await sendWhatsAppText(wa.phone_number_id, accessToken, m.from, textToSend);
            if (!send.ok) {
              // Meta rechazó el envío (401/token, plantilla requerida fuera de la ventana, etc.).
              // No guardamos el mensaje como si hubiera llegado — logueamos y salimos.
              console.error(
                JSON.stringify({
                  level: "error",
                  msg: "outbound send failed",
                  total_ms: Date.now() - receivedAt,
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
              content: textToSend,
              raw: null,
            });
          }
          if (reply) {
            await admin
              .from("conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", conv.id);
          }

          await Promise.all([typing, saveLanguage]);

          console.log(
            JSON.stringify({
              level: "info",
              msg: "agent turn completed",
              organization_id,
              wa_message_id: m.id,
              latency_ms,
              total_ms: Date.now() - receivedAt,
              reply_language: replyLanguage,
              replied: reply.length > 0,
              voice: voiceStatus,
              voice_reply: sentVoice,
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
