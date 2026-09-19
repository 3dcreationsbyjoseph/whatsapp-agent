// Envía las siguientes N fotos de una propiedad al cliente. Detecta qué
// fotos ya se enviaron en esta conversación buscando outbound "[imagen] URL".

import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppImage } from "@/lib/whatsapp/send";

export function makeSendMorePropertyPhotosTool(ctx: {
  organization_id: string;
  contact_phone: string;
  conversation_id: string;
  phone_number_id: string;
  access_token: string;
}) {
  return tool({
    description:
      "Envía las siguientes fotos de una propiedad al cliente por WhatsApp. Llámala SIEMPRE cuando el cliente pida más fotos, otras fotos, 'envíame X más' o expresiones equivalentes. NUNCA le digas al cliente que hay un problema técnico sin haber llamado antes a esta tool.",
    inputSchema: z.object({
      property_id: z.string().uuid().describe("UUID de la propiedad que se está discutiendo con el cliente."),
      count: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(6)
        .describe("Cuántas fotos quiere el cliente. Si dijo 'envíame 4 más' pasa 4. Si dijo 'todas' pasa 20."),
    }),
    execute: async ({ property_id, count }) => {
      const admin = createAdminClient();
      const startedAt = new Date().toISOString();
      const logEntry = async (payload: Record<string, unknown>) => {
        try {
          await admin.from("messages").insert({
            conversation_id: ctx.conversation_id,
            organization_id: ctx.organization_id,
            wa_message_id: null,
            direction: "outbound",
            sender: "bot",
            content: `[debug] send_more_property_photos ${JSON.stringify({ startedAt, ...payload })}`,
            raw: null,
          });
        } catch {
          /* noop */
        }
      };

      try {
        const { data: p, error: pErr } = await admin
          .from("properties")
          .select("photo_urls, title")
          .eq("id", property_id)
          .eq("organization_id", ctx.organization_id)
          .maybeSingle();
        if (pErr) {
          await logEntry({ stage: "property_lookup_error", err: pErr.message });
          return { ok: false, error: "No se pudo cargar la propiedad." };
        }
        if (!p) {
          await logEntry({ stage: "property_not_found", property_id });
          return { ok: false, error: "Propiedad no encontrada." };
        }

        const all: string[] = Array.isArray(p.photo_urls) ? (p.photo_urls as string[]) : [];
        if (all.length === 0) {
          await logEntry({ stage: "no_photos_in_catalog" });
          return { ok: false, error: "Esta propiedad no tiene fotografías registradas." };
        }

        const { data: sentMessages, error: mErr } = await admin
          .from("messages")
          .select("content")
          .eq("conversation_id", ctx.conversation_id)
          .eq("direction", "outbound")
          .order("created_at", { ascending: false })
          .limit(1000);
        if (mErr) {
          await logEntry({ stage: "history_lookup_error", err: mErr.message });
          return { ok: false, error: "No se pudo consultar el historial." };
        }

        const alreadySent = new Set<string>();
        for (const m of sentMessages ?? []) {
          const c = (m.content ?? "").trim();
          if (c.startsWith("[imagen] ")) alreadySent.add(c.slice("[imagen] ".length).trim());
        }
        const pending = all.filter((u) => !alreadySent.has(u));

        await logEntry({
          stage: "computed_pending",
          total: all.length,
          already_sent: alreadySent.size,
          pending: pending.length,
          requested: count,
        });

        if (pending.length === 0) {
          return {
            ok: false,
            error: "Ya se han enviado todas las fotografías disponibles.",
            total_in_catalog: all.length,
          };
        }

        const batch = pending.slice(0, Math.min(count, pending.length));
        let sent = 0;
        const errors: string[] = [];
        for (const photoUrl of batch) {
          try {
            const res = await sendWhatsAppImage(
              ctx.phone_number_id,
              ctx.access_token,
              ctx.contact_phone,
              photoUrl,
            );
            if (res.ok) {
              sent++;
              await admin.from("messages").insert({
                conversation_id: ctx.conversation_id,
                organization_id: ctx.organization_id,
                wa_message_id: res.message_id ?? null,
                direction: "outbound",
                sender: "bot",
                content: `[imagen] ${photoUrl}`,
                raw: null,
              });
            } else {
              errors.push(`${photoUrl}: ${res.error ?? "unknown"}`);
            }
          } catch (e) {
            errors.push(`${photoUrl}: ${(e as Error).message}`);
          }
        }

        await logEntry({
          stage: "finished",
          batch_size: batch.length,
          sent,
          errors_count: errors.length,
        });

        await admin
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", ctx.conversation_id);

        const remaining = pending.length - sent;
        return {
          ok: sent > 0,
          photos_sent_now: sent,
          photos_remaining_after: Math.max(0, remaining),
          total_in_catalog: all.length,
          errors: errors.length ? errors : undefined,
          note:
            sent === 0
              ? "No se pudo enviar ninguna foto por un error de red."
              : remaining > 0
              ? `Enviadas ${sent}. Quedan ${remaining} disponibles.`
              : `Enviadas las últimas ${sent} fotos disponibles.`,
        };
      } catch (e) {
        await logEntry({ stage: "top_exception", err: (e as Error).message });
        return { ok: false, error: `Error inesperado: ${(e as Error).message}` };
      }
    },
  });
}
