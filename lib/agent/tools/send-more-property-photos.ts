// Envía las siguientes fotos de una propiedad al cliente. Cuenta cuántas ya
// se han enviado en esta conversación (buscando outbound messages tipo
// "[imagen] URL") y envía las siguientes en lotes de 6.

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
      "Envía las SIGUIENTES fotografías de una propiedad al cliente. Úsala cuando el cliente pida más fotos, otras fotos, o expresiones similares. La tool detecta automáticamente qué fotos ya se enviaron en esta conversación y manda hasta 6 nuevas.",
    inputSchema: z.object({
      property_id: z.string().uuid(),
    }),
    execute: async ({ property_id }) => {
      const admin = createAdminClient();
      try {
        const { data: p, error: pErr } = await admin
          .from("properties")
          .select("photo_urls, title")
          .eq("id", property_id)
          .eq("organization_id", ctx.organization_id)
          .maybeSingle();
        if (pErr) {
          console.error(JSON.stringify({ level: "error", tool: "send_more_property_photos", stage: "property_lookup", err: pErr.message }));
          return { ok: false, error: "No se pudo cargar la propiedad de la base de datos." };
        }
        if (!p) return { ok: false, error: "Propiedad no encontrada." };

        const all: string[] = Array.isArray(p.photo_urls) ? (p.photo_urls as string[]) : [];
        if (all.length === 0) return { ok: false, error: "Esta propiedad no tiene fotografías registradas." };

        // Fetch outbound messages of this conversation (limit generosamente) y
        // filtramos localmente para evitar problemas con caracteres especiales en LIKE.
        const { data: sentMessages, error: mErr } = await admin
          .from("messages")
          .select("content, created_at")
          .eq("conversation_id", ctx.conversation_id)
          .eq("direction", "outbound")
          .order("created_at", { ascending: false })
          .limit(500);
        if (mErr) {
          console.error(JSON.stringify({ level: "error", tool: "send_more_property_photos", stage: "history_lookup", err: mErr.message }));
          return { ok: false, error: "No se pudo consultar el historial de mensajes." };
        }

        const alreadySent = new Set<string>();
        for (const m of sentMessages ?? []) {
          const c = (m.content ?? "").trim();
          if (c.startsWith("[imagen] ")) alreadySent.add(c.slice("[imagen] ".length).trim());
        }
        const pending = all.filter((u) => !alreadySent.has(u));

        console.log(JSON.stringify({
          level: "info", tool: "send_more_property_photos",
          property_id, total: all.length, already_sent: alreadySent.size, pending: pending.length,
        }));

        if (pending.length === 0) {
          return {
            ok: false,
            error: "Ya se han enviado todas las fotografías disponibles de esta propiedad al cliente.",
            total_in_catalog: all.length,
          };
        }

        const batch = pending.slice(0, 6);
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
              console.error(JSON.stringify({ level: "error", tool: "send_more_property_photos", stage: "image_send", url: photoUrl, err: res.error }));
            }
          } catch (e) {
            errors.push(`${photoUrl}: ${(e as Error).message}`);
            console.error(JSON.stringify({ level: "error", tool: "send_more_property_photos", stage: "image_send_exception", url: photoUrl, err: (e as Error).message }));
          }
        }

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
              ? "No se envió ninguna foto por error técnico."
              : remaining > 0
              ? `Enviadas ${sent} fotos. Quedan ${remaining} disponibles.`
              : `Enviadas las últimas ${sent}. Ya no quedan más.`,
        };
      } catch (e) {
        console.error(JSON.stringify({ level: "error", tool: "send_more_property_photos", stage: "top", err: (e as Error).message, stack: (e as Error).stack?.slice(0,500) }));
        return { ok: false, error: `Error inesperado: ${(e as Error).message}` };
      }
    },
  });
}
