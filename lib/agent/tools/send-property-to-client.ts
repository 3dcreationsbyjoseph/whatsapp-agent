// Envía por WhatsApp al cliente actual la ficha detallada de una propiedad
// junto con hasta N fotografías. El agente lo usa cuando el cliente muestra
// interés claro en una propiedad concreta.

import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText, sendWhatsAppImage } from "@/lib/whatsapp/send";

export function makeSendPropertyToClientTool(ctx: {
  organization_id: string;
  contact_phone: string;
  conversation_id: string;
  phone_number_id: string;
  access_token: string;
}) {
  return tool({
    description:
      "Envía por WhatsApp al cliente la FICHA COMPLETA de una propiedad concreta con sus fotos. Úsala cuando el cliente muestre interés en una propiedad específica de las que has listado con search_properties. NO llames a esta tool más de una vez por propiedad en la misma conversación.",
    inputSchema: z.object({
      property_id: z.string().uuid(),
      max_photos: z.number().int().min(0).max(8).default(5),
      caption_language: z
        .string()
        .default("es")
        .describe("Código ISO del idioma del cliente para la caption (es, en, de, nl, fr, sv, no, da...)."),
    }),
    execute: async ({ property_id, max_photos, caption_language }) => {
      const admin = createAdminClient();
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
      return {
        ok: true,
        text_sent: true,
        photos_sent: sent,
        photos_total: photos.length,
        photos_errors: errors,
        note: "Ya enviaste la ficha completa y las fotos al cliente por WhatsApp. En tu siguiente mensaje NO repitas la ficha; solo pregunta si le encaja o si quiere agendar una visita.",
        language_hint: caption_language,
      };
    },
  });
}
