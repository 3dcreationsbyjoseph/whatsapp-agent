// Envía por WhatsApp al cliente actual la ficha detallada de una propiedad
// junto con hasta N fotografías. El agente lo usa cuando el cliente muestra
// interés claro en una propiedad concreta.

import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText, sendWhatsAppImage } from "@/lib/whatsapp/send";
import { resolveCurrentPropertyId } from "../resolve-current-property";
import { clientLanguageSample, translateForClient } from "../translate";
import type { PlanFeatures } from "@/lib/billing/plans";

// La ficha empieza por "🏡 *Título*" y, si hay referencia, la línea siguiente es
// "Ref. X". El procesador lo usa para saber qué fichas se enviaron ya.
export const FICHA_PREFIX = "🏡 *";

export function parseFicha(content: string | null | undefined): { title: string; reference: string | null } | null {
  if (!content?.startsWith(FICHA_PREFIX)) return null;
  const m = content.match(/^🏡 \*(.+?)\*\n(?:Ref\. ([^\n]+)\n)?/u);
  return m ? { title: m[1], reference: m[2]?.trim() ?? null } : null;
}

// Mensaje para el modelo cuando la propiedad ya no está disponible.
export function unavailableError(title: string, status: string): string {
  const label = status === "reserved" ? "reservada" : status === "sold" ? "vendida" : "retirada del mercado";
  return `La propiedad «${title}» está ${label}: no se puede enviar ni visitar. Díselo al cliente con tacto y ofrécele alternativas parecidas con search_properties.`;
}

export function makeSendPropertyToClientTool(ctx: {
  organization_id: string;
  contact_phone: string;
  conversation_id: string;
  phone_number_id: string;
  access_token: string;
  plan: PlanFeatures;
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
        .optional()
        .describe("Código ISO del idioma en que habla el cliente (es, en, de, nl, fr, pt, pl, zh...). La ficha se traduce a ese idioma; si lo omites se detecta de sus mensajes."),
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
        if (p.status !== "available") return { ok: false, error: unavailableError(p.title, p.status) };

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

        // Al idioma del cliente (los datos salen del catálogo; el modelo solo traduce).
        const ficha = await translateForClient(
          fichaEs,
          caption_language
            ? { language: caption_language }
            : { sample: await clientLanguageSample(ctx.conversation_id) },
          ctx.plan,
        );

        // Envía primero el texto.
        const textRes = await sendWhatsAppText(
          ctx.phone_number_id,
          ctx.access_token,
          ctx.contact_phone,
          ficha,
        );
        if (!textRes.ok) return { ok: false, error: `Envío texto: ${textRes.error}` };

        // Guarda el texto como mensaje outbound.
        await admin.from("messages").insert({
          conversation_id: ctx.conversation_id,
          organization_id: ctx.organization_id,
          wa_message_id: textRes.message_id ?? null,
          direction: "outbound",
          sender: "bot",
          content: ficha,
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
