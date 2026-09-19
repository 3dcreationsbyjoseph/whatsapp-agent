// Guarda / actualiza los criterios de búsqueda del cliente (cualificación de lead).
// El bot lo usa apenas descubre información relevante para no perderla.

import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export function makeSaveLeadTool(ctx: { organization_id: string; contact_id: string }) {
  return tool({
    description:
      "Guarda o actualiza los criterios de búsqueda del cliente (presupuesto, zonas, tipo, dormitorios, timeline, financiación, idioma). Úsala en cuanto descubras información nueva. Es idempotente: llama las veces que haga falta.",
    inputSchema: z.object({
      budget_min_eur: z.number().int().nonnegative().optional(),
      budget_max_eur: z.number().int().nonnegative().optional(),
      preferred_locations: z.array(z.string()).optional(),
      preferred_types: z.array(z.string()).optional(),
      min_bedrooms: z.number().int().nonnegative().optional(),
      min_bathrooms: z.number().int().nonnegative().optional(),
      needs_pool: z.boolean().optional(),
      needs_sea_view: z.boolean().optional(),
      timeline: z
        .string()
        .optional()
        .describe("Ej. 'inmediato', '3-6 meses', 'más de 6 meses', 'sin prisa'"),
      financing: z
        .string()
        .optional()
        .describe("Ej. 'contado', 'hipoteca', 'mixto', 'por definir'"),
      language: z.string().optional().describe("Código ISO del idioma del cliente (es, en, de, ...)"),
      qualified: z.boolean().optional(),
      notes: z.string().optional(),
    }),
    execute: async (args) => {
      const admin = createAdminClient();
      const patch = Object.fromEntries(
        Object.entries(args).filter(([, v]) => v !== undefined),
      );

      const { error } = await admin
        .from("leads")
        .upsert(
          { organization_id: ctx.organization_id, contact_id: ctx.contact_id, ...patch },
          { onConflict: "organization_id,contact_id", ignoreDuplicates: false },
        );
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
  });
}
