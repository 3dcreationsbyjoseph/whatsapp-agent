// Envía al cliente el enlace de vídeo o tour virtual de una propiedad como
// mensaje de texto con preview_url:true (WhatsApp renderiza la preview
// automática de YouTube/Vimeo/Matterport).

import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText } from "@/lib/whatsapp/send";
import { resolveCurrentPropertyId } from "../resolve-current-property";

export function makeSendPropertyVideoTool(ctx: {
  organization_id: string;
  contact_phone: string;
  conversation_id: string;
  phone_number_id: string;
  access_token: string;
}) {
  return tool({
    description:
      "Envía al cliente por WhatsApp el enlace del vídeo o tour virtual de una propiedad concreta. Úsala cuando el cliente pida ver un vídeo, un tour virtual o material visual adicional. Devuelve ok:false si la propiedad no tiene vídeo ni tour.",
    inputSchema: z.object({
      property_id: z
        .string()
        .optional()
        .describe("UUID de la propiedad. Si no lo sabes con seguridad, omítelo: la tool detecta la propiedad activa automáticamente."),
      prefer: z
        .enum(["video", "tour", "auto"])
        .default("auto")
        .describe("'auto' envía primero el vídeo si existe, si no el tour."),
    }),
    execute: async ({ property_id, prefer }) => {
      const admin = createAdminClient();
      try {
        const resolvedId = await resolveCurrentPropertyId({
          organization_id: ctx.organization_id,
          conversation_id: ctx.conversation_id,
          candidate: property_id,
        });
        if (!resolvedId) return { ok: false, error: "No hay ninguna propiedad activa en esta conversación." };
        const { data: p, error: pErr } = await admin
          .from("properties")
          .select("title, video_url, virtual_tour_url")
          .eq("id", resolvedId)
          .eq("organization_id", ctx.organization_id)
          .maybeSingle();
        if (pErr) {
          console.error(JSON.stringify({ level: "error", tool: "send_property_video", stage: "property_lookup", err: pErr.message }));
          return { ok: false, error: "No se pudo cargar la propiedad." };
        }
        if (!p) return { ok: false, error: "Propiedad no encontrada." };

        const video = (p.video_url ?? "").trim();
        const tour = (p.virtual_tour_url ?? "").trim();
        const hasVideo = video.length > 0;
        const hasTour = tour.length > 0;

        console.log(JSON.stringify({
          level: "info", tool: "send_property_video",
          property_id, hasVideo, hasTour, prefer,
        }));

        if (!hasVideo && !hasTour) {
          return { ok: false, error: "Esta propiedad no tiene vídeo ni tour virtual registrado." };
        }

        const toSend: Array<{ label: string; url: string }> = [];
        if (prefer === "video" && hasVideo) toSend.push({ label: "Vídeo", url: video });
        else if (prefer === "tour" && hasTour) toSend.push({ label: "Tour virtual", url: tour });
        else {
          if (hasVideo) toSend.push({ label: "Vídeo", url: video });
          if (hasTour) toSend.push({ label: "Tour virtual", url: tour });
        }

        const errors: string[] = [];
        let sent = 0;
        for (const { label, url } of toSend) {
          try {
            const body = `🎥 ${label} de ${p.title}:\n${url}`;
            const res = await sendWhatsAppText(
              ctx.phone_number_id,
              ctx.access_token,
              ctx.contact_phone,
              body,
            );
            if (!res.ok) {
              errors.push(res.error ?? "unknown");
              console.error(JSON.stringify({ level: "error", tool: "send_property_video", stage: "text_send", err: res.error }));
              continue;
            }
            sent++;
            await admin.from("messages").insert({
              conversation_id: ctx.conversation_id,
              organization_id: ctx.organization_id,
              wa_message_id: res.message_id ?? null,
              direction: "outbound",
              sender: "bot",
              content: body,
              raw: null,
            });
          } catch (e) {
            errors.push((e as Error).message);
            console.error(JSON.stringify({ level: "error", tool: "send_property_video", stage: "text_send_exception", err: (e as Error).message }));
          }
        }

        await admin
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", ctx.conversation_id);

        return {
          ok: sent > 0,
          sent,
          errors: errors.length ? errors : undefined,
          note:
            sent > 0
              ? "Enlace de vídeo enviado. No lo repitas en tu siguiente mensaje; solo pregunta si el cliente desea agendar visita."
              : "El envío falló. Discúlpate y ofrece agendar visita presencial o llamada informativa.",
        };
      } catch (e) {
        console.error(JSON.stringify({ level: "error", tool: "send_property_video", stage: "top", err: (e as Error).message, stack: (e as Error).stack?.slice(0,500) }));
        return { ok: false, error: `Error inesperado: ${(e as Error).message}` };
      }
    },
  });
}
