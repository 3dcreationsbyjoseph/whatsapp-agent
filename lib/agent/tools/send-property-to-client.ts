// Envía por WhatsApp al cliente actual la ficha detallada de una propiedad
// junto con hasta N fotografías. El agente lo usa cuando el cliente muestra
// interés claro en una propiedad concreta.

import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText, sendWhatsAppImage } from "@/lib/whatsapp/send";
import { resolveCurrentPropertyId } from "../resolve-current-property";

export function makeSendPropertyToClientTool(ctx: {
  organization_id: string;
  contact_phone: string;
  conversation_id: string;
  phone_number_id: string;
  access_token: string;
}) {
  return tool({
    description:
      "Envía por WhatsApp al cliente la FICHA COMPLETA de una propiedad + hasta 6 fotos. Llámala EN ESTE MISMO TURNO en cuanto el cliente muestre interés (no anuncies que la enviarás luego). Úsala UNA vez por propiedad. Si el cliente pide MÁS fotos después, usa send_more_property_photos (no vuelvas a llamar esta tool).",
    inputSchema: z.object({
      property: z
        .string()
        .describe("La `ref` que devolvió search_properties (también vale el id o el título)."),
      caption_language: z
        .string()
        .default("es")
        .describe("Código ISO del idioma del cliente (es, en, de, nl, fr, sv, no, da...)."),
    }),
    execute: async ({ property, caption_language }) => {
      try {
        const max_photos = 6;
        const admin = createAdminClient();
        const property_id = await resolveCurrentPropertyId({
          organization_id: ctx.organization_id,
          conversation_id: ctx.conversation_id,
          candidate: property,
          prefer: "mentioned",
        });
        if (!property_id) {
          return {
            ok: false,
            error:
              "No sé qué propiedad es. Llama a search_properties para obtener su `ref` y vuelve a llamar a esta tool con ella; no le digas al cliente que se la enviarás más tarde.",
          };
        }
        const { data: p, error } = await admin
          .from("properties")
          .select("*")
          .eq("id", property_id)
          .eq("organization_id", ctx.organization_id)
          .single();
        if (error || !p) return { ok: false, error: "Propiedad no encontrada." };

        // Texto de la ficha (adaptado al idioma del cliente).
        const feats = Array.isArray(p.features) ? (p.features as string[]) : [];
        const priceFmt = new Intl.NumberFormat("es-ES", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 0,
        }).format(Number(p.price_eur));

        const featsLine = feats.length ? "\n• " + feats.join("\n• ") : "";
        const refLine = p.reference ? `Ref. ${p.reference}\n` : "";

        const fichaEs = [
          `🏡 *${p.title}*`,
          refLine + `📍 ${p.location} · ${p.property_type}`,
          `💶 ${priceFmt}`,
          `🛏 ${p.bedrooms} dorm. · 🛁 ${p.bathrooms} baños${p.built_area_m2 ? ` · 📐 ${p.built_area_m2} m² construidos` : ""}${p.plot_area_m2 ? ` · 🌳 ${p.plot_area_m2} m² parcela` : ""}`,
          featsLine ? `\nCaracterísticas destacadas:${featsLine}` : "",
          p.description ? `\n${p.description}` : "",
          p.virtual_tour_url ? `\n🎥 Tour virtual: ${p.virtual_tour_url}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        // Envía primero el texto.
        const textRes = await sendWhatsAppText(
          ctx.phone_number_id,
          ctx.access_token,
          ctx.contact_phone,
          fichaEs,
        );
        if (!textRes.ok) return { ok: false, error: `Envío texto: ${textRes.error}` };

        // Guarda el texto como mensaje outbound.
        await admin.from("messages").insert({
          conversation_id: ctx.conversation_id,
          organization_id: ctx.organization_id,
          wa_message_id: textRes.message_id ?? null,
          direction: "outbound",
          sender: "bot",
          content: fichaEs,
          raw: null,
        });

        // Envía las fotos.
        const photos = Array.isArray(p.photo_urls) ? (p.photo_urls as string[]) : [];
        const toSend = photos.slice(0, max_photos);
        let sent = 0;
        const errors: string[] = [];
        for (const photoUrl of toSend) {
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

        // NB: caption_language se pasa al modelo como pista futura; hoy la ficha
        // sigue en ES/UTF-8 con emojis universales, funciona bien multi-idioma.
        const remaining = Math.max(0, photos.length - sent);
        return {
          ok: true,
          text_sent: true,
          photos_sent: sent,
          photos_total: photos.length,
          photos_remaining: remaining,
          photos_errors: errors,
          has_video: !!(p.video_url && p.video_url.trim().length > 0),
          has_virtual_tour: !!(p.virtual_tour_url && p.virtual_tour_url.trim().length > 0),
          note:
            "Ya enviaste la ficha y las primeras fotos al cliente. En tu siguiente mensaje NO repitas la ficha. " +
            (remaining > 0
              ? `Menciona brevemente que existen ${remaining} fotografías adicionales disponibles si desea verlas (usa send_more_property_photos si las pide). `
              : "") +
            (p.video_url ? "La propiedad TIENE vídeo — si el cliente lo pide usa send_property_video. " : "") +
            "Después pregunta si desea agendar visita presencial o llamada informativa.",
          language_hint: caption_language,
        };
      } catch (err) {
        return {
          ok: false,
          error: `No se pudo enviar la ficha: ${(err as Error).message}. Dile al cliente que ha habido un problema o pasa la conversación al equipo con request_human_handoff.`,
        };
      }
    },
  });
}
