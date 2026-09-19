// Envía al cliente el enlace de vídeo o tour virtual de una propiedad.
// Los enlaces de YouTube / Vimeo se envían como texto con preview automático
// de WhatsApp — no como media (WhatsApp solo acepta MP4 nativos).

import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText } from "@/lib/whatsapp/send";

export function makeSendPropertyVideoTool(ctx: {
  organization_id: string;
  contact_phone: string;
  conversation_id: string;
  phone_number_id: string;
  access_token: string;
}) {
  return tool({
    description:
      "Envía al cliente por WhatsApp el enlace de vídeo o tour virtual de una propiedad concreta. Úsala cuando el cliente pida ver un vídeo, un tour o material visual adicional. Devuelve ok:false si la propiedad no tiene ni vídeo ni tour.",
    inputSchema: z.object({
      property_id: z.string().uuid(),
      prefer: z
        .enum(["video", "tour", "auto"])
        .default("auto")
        .describe("Qué material enviar. 'auto' envía primero el vídeo si existe, si no el tour."),
    }),
    execute: async ({ property_id, prefer }) => {
      const admin = createAdminClient();
      const { data: p } = await admin
        .from("properties")
        .select("title, video_url, virtual_tour_url")
        .eq("id", property_id)
        .eq("organization_id", ctx.organization_id)
        .single();
      if (!p) return { ok: false, error: "Propiedad no encontrada" };

      const hasVideo = !!p.video_url && p.video_url.trim().length > 0;
      const hasTour = !!p.virtual_tour_url && p.virtual_tour_url.trim().length > 0;

      if (!hasVideo && !hasTour) {
        return { ok: false, error: "Esta propiedad no tiene vídeo ni tour virtual registrado." };
      }

      let sendList: Array<{ label: string; url: string }> = [];
      if (prefer === "video" && hasVideo) sendList = [{ label: "vídeo", url: p.video_url! }];
      else if (prefer === "tour" && hasTour) sendList = [{ label: "tour virtual", url: p.virtual_tour_url! }];
      else {
        if (hasVideo) sendList.push({ label: "vídeo", url: p.video_url! });
        if (hasTour) sendList.push({ label: "tour virtual", url: p.virtual_tour_url! });
      }

      const errors: string[] = [];
      for (const { label, url } of sendList) {
        const body = `🎥 ${label.charAt(0).toUpperCase() + label.slice(1)} de ${p.title}:\n${url}`;
        const res = await sendWhatsAppText(
          ctx.phone_number_id,
          ctx.access_token,
          ctx.contact_phone,
          body,
        );
        if (!res.ok) {
          errors.push(res.error ?? "unknown");
          continue;
        }
        await admin.from("messages").insert({
          conversation_id: ctx.conversation_id,
          organization_id: ctx.organization_id,
          wa_message_id: res.message_id ?? null,
          direction: "outbound",
          sender: "bot",
          content: body,
          raw: null,
        });
      }

      await admin
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", ctx.conversation_id);

      return {
        ok: errors.length === 0,
        sent: sendList.length - errors.length,
        errors,
        note: "Ya enviaste el enlace del vídeo al cliente. NO lo repitas en tu siguiente respuesta.",
      };
    },
  });
}
