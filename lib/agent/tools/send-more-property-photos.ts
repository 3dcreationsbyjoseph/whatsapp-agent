// Envía las siguientes fotos de una propiedad. Se usa cuando el cliente pide
// "más fotos" después de haber recibido la ficha inicial.
//
// La tool cuenta cuántas fotos ya se han enviado en esta conversación (buscando
// los mensajes outbound con "[imagen] <URL>" que coinciden con photo_urls) y
// envía las siguientes 6, o menos si ya no quedan.

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
      "Envía las siguientes fotografías de una propiedad al cliente por WhatsApp. Úsala solo si el cliente PIDE explícitamente más fotos después de haber recibido la ficha con send_property_to_client. Automáticamente detecta cuántas ya se enviaron y manda hasta 6 nuevas.",
    inputSchema: z.object({
      property_id: z.string().uuid(),
    }),
    execute: async ({ property_id }) => {
      const admin = createAdminClient();

      const { data: p } = await admin
        .from("properties")
        .select("photo_urls, title")
        .eq("id", property_id)
        .eq("organization_id", ctx.organization_id)
        .single();
      if (!p) return { ok: false, error: "Propiedad no encontrada" };

      const all = Array.isArray(p.photo_urls) ? (p.photo_urls as string[]) : [];
      if (all.length === 0) return { ok: false, error: "Esta propiedad no tiene fotos registradas." };

      // Cuenta cuántas de las fotos ya se han enviado a este contacto/conversación
      const { data: sentMessages } = await admin
        .from("messages")
        .select("content")
        .eq("conversation_id", ctx.conversation_id)
        .eq("direction", "outbound")
        .like("content", "[imagen] %");
      const sentSet = new Set(
        (sentMessages ?? [])
          .map((m) => (m.content ?? "").replace(/^\[imagen\]\s+/, "").trim())
          .filter(Boolean),
      );

      const pending = all.filter((u) => !sentSet.has(u));
      if (pending.length === 0) {
        return {
          ok: false,
          error: "Ya se han enviado todas las fotos de esta propiedad al cliente.",
          total_in_catalog: all.length,
        };
      }

      const batch = pending.slice(0, 6);
      let sent = 0;
      const errors: string[] = [];
      for (const photoUrl of batch) {
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
          errors.push(res.error ?? "unknown");
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
        errors,
        note:
          remaining > 0
            ? `Se enviaron ${sent} fotos más. Quedan ${remaining} disponibles si el cliente las pide.`
            : `Se enviaron las últimas ${sent} fotos. Ya no quedan más para esta propiedad.`,
      };
    },
  });
}
