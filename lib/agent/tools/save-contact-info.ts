import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { cleanName, hasFullName, normalizeEmail, normalizePhone, readMetadata } from "@/lib/contact-info";

// El teléfono de contacto se guarda en contacts.metadata.contact_phone (columna
// jsonb ya existente, sin migración). wa_phone sigue siendo el número de WhatsApp.
export function makeSaveContactInfoTool(ctx: { contact_id: string; organization_id: string; wa_phone: string }) {
  return tool({
    description:
      "Guarda el nombre completo (nombre + dos apellidos), el teléfono de contacto y/o el email del cliente en cuanto los diga. El teléfono puede ser distinto del WhatsApp; si dice que es este mismo número, pasa same_as_whatsapp=true. La respuesta indica si aún falta algo.",
    inputSchema: z.object({
      full_name: z.string().nullish().describe("Nombre y apellidos tal como los dio el cliente."),
      contact_phone: z.string().nullish().describe("Teléfono de contacto tal como lo dio el cliente."),
      same_as_whatsapp: z.boolean().nullish(),
      email: z.string().nullish().describe("Email del cliente (opcional)."),
    }),
    execute: async ({ full_name, contact_phone, same_as_whatsapp, email }) => {
      try {
        const admin = createAdminClient();
        const { data: current } = await admin
          .from("contacts")
          .select("full_name, metadata")
          .eq("id", ctx.contact_id)
          .eq("organization_id", ctx.organization_id)
          .maybeSingle();
        const meta = readMetadata(current?.metadata);

        const patch: { full_name?: string; metadata?: Json } = {};
        const newMeta: Record<string, unknown> = { ...meta };
        const problems: string[] = [];

        if (full_name) {
          const name = cleanName(full_name);
          if (name) {
            // El nombre que da el cliente siempre gana al del perfil de WhatsApp.
            patch.full_name = name;
            newMeta.name_source = "agent";
          } else {
            problems.push("El nombre no es válido.");
          }
        }

        if (same_as_whatsapp) {
          newMeta.contact_phone = normalizePhone(ctx.wa_phone) ?? ctx.wa_phone;
        } else if (contact_phone) {
          const phone = normalizePhone(contact_phone);
          if (phone) newMeta.contact_phone = phone;
          else problems.push("El teléfono no parece válido: pídeselo de nuevo con el prefijo si no es español.");
        }

        if (email) {
          const e = normalizeEmail(email);
          if (e) newMeta.email = e;
          else problems.push("El email no parece válido: pídeselo de nuevo.");
        }

        if (JSON.stringify(newMeta) !== JSON.stringify(meta)) patch.metadata = newMeta as Json;
        if (Object.keys(patch).length > 0) {
          const { error } = await admin
            .from("contacts")
            .update(patch)
            .eq("id", ctx.contact_id)
            .eq("organization_id", ctx.organization_id);
          if (error) return { ok: false, error: error.message };
        }

        const finalName = patch.full_name ?? (meta.name_source === "whatsapp" ? null : current?.full_name);
        const missing: string[] = [];
        if (!hasFullName(finalName)) missing.push("nombre completo con los dos apellidos");
        if (!newMeta.contact_phone) missing.push("teléfono de contacto");
        // El email es opcional: se pide una vez; si no quiere darlo, no se insiste.
        const optional = newMeta.email ? [] : ["email (opcional, para enviarle la confirmación)"];

        return {
          ok: problems.length === 0,
          saved: { full_name: patch.full_name ?? null, contact_phone: newMeta.contact_phone ?? null, email: newMeta.email ?? null },
          ...(problems.length ? { problems } : {}),
          missing,
          optional,
          note: missing.length
            ? `Aún falta: ${missing.join(" y ")}. Pídeselo con amabilidad en un momento natural (sin bloquear sus preguntas).`
            : "Datos de contacto completos.",
        };
      } catch (err) {
        return { ok: false, error: `No se pudieron guardar los datos: ${(err as Error).message}` };
      }
    },
  });
}
