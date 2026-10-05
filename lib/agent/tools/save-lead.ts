// Guarda / actualiza los criterios de búsqueda del cliente (cualificación de lead).
// El bot lo usa apenas descubre información relevante para no perderla.
//
// El presupuesto se pasa con las PALABRAS del cliente y se interpreta en código
// (lib/budget.ts): el modelo calculaba mal ("about 3M" → 0–2,5 M). Zonas y tipos
// se AÑADEN a los ya guardados en vez de sustituirlos, y las notas se acumulan.

import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBudget } from "@/lib/budget";
import type { Database, Json } from "@/lib/database.types";

type LeadRow = {
  budget_min_eur: number | null;
  budget_max_eur: number | null;
  preferred_locations: unknown;
  preferred_types: unknown;
  notes: string | null;
};

function mergeList(current: unknown, added: string[] | null | undefined, replace: boolean): string[] | undefined {
  if (!added || added.length === 0) return undefined;
  const base = replace || !Array.isArray(current) ? [] : (current as string[]);
  const seen = new Set(base.map((x) => x.toLowerCase().trim()));
  const out = [...base];
  for (const a of added) {
    const v = a.trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

export function makeSaveLeadTool(ctx: { organization_id: string; contact_id: string }) {
  return tool({
    description:
      "Guarda los criterios de búsqueda del cliente en cuanto los diga. Pasa SOLO lo que el cliente haya dicho en este momento; lo demás se conserva. Zonas y tipos se añaden a los ya guardados (usa replace_lists=true solo si el cliente cambia de idea).",
    inputSchema: z.object({
      budget_text: z
        .string()
        .nullish()
        .describe("El presupuesto con las palabras EXACTAS del cliente, p. ej. 'about 3M', 'entre 1 y 1,5 millones', 'hasta 800k'. No lo conviertas tú a números. Solo cuando el cliente hable de presupuesto."),
      preferred_locations: z.array(z.string()).nullish(),
      preferred_types: z.array(z.string()).nullish(),
      replace_lists: z.boolean().nullish().describe("true si el cliente sustituye sus zonas/tipos anteriores."),
      min_bedrooms: z.number().int().positive().nullish(),
      min_bathrooms: z.number().int().positive().nullish(),
      needs_pool: z.boolean().nullish(),
      needs_sea_view: z.boolean().nullish(),
      timeline: z.string().nullish().describe("Ej. 'inmediato', '3-6 meses', 'más de 6 meses', 'sin prisa'"),
      financing: z.string().nullish().describe("Ej. 'contado', 'hipoteca', 'mixto', 'por definir'"),
      language: z.string().nullish().describe("Código ISO del idioma del cliente (es, en, de, ...)"),
      qualified: z.boolean().nullish(),
      note: z.string().nullish().describe("Dato relevante nuevo (se añade a las notas existentes)."),
    }),
    execute: async (args) => {
      try {
        const admin = createAdminClient();
        const { data: current } = await admin
          .from("leads")
          .select("budget_min_eur, budget_max_eur, preferred_locations, preferred_types, notes")
          .eq("organization_id", ctx.organization_id)
          .eq("contact_id", ctx.contact_id)
          .maybeSingle<LeadRow>();

        const patch: Database["public"]["Tables"]["leads"]["Update"] = {};
        let budget: { min: number | null; max: number | null } | null = null;
        if (args.budget_text) {
          budget = parseBudget(args.budget_text);
          if (budget) {
            patch.budget_min_eur = budget.min;
            patch.budget_max_eur = budget.max;
          }
        }
        const locs = mergeList(current?.preferred_locations, args.preferred_locations, !!args.replace_lists);
        if (locs) patch.preferred_locations = locs as Json;
        const types = mergeList(current?.preferred_types, args.preferred_types, !!args.replace_lists);
        if (types) patch.preferred_types = types as Json;
        if (args.min_bedrooms) patch.min_bedrooms = args.min_bedrooms;
        if (args.min_bathrooms) patch.min_bathrooms = args.min_bathrooms;
        if (args.needs_pool != null) patch.needs_pool = args.needs_pool;
        if (args.needs_sea_view != null) patch.needs_sea_view = args.needs_sea_view;
        if (args.timeline) patch.timeline = args.timeline;
        if (args.financing) patch.financing = args.financing;
        if (args.language) patch.language = args.language;
        if (args.qualified != null) patch.qualified = args.qualified;
        if (args.note?.trim()) {
          const n = args.note.trim();
          patch.notes = current?.notes ? (current.notes.includes(n) ? current.notes : `${current.notes}\n${n}`) : n;
        }
        if (Object.keys(patch).length === 0) return { ok: true, updated: false };
        patch.updated_at = new Date().toISOString();

        const { error } = await admin
          .from("leads")
          .upsert(
            { organization_id: ctx.organization_id, contact_id: ctx.contact_id, ...patch },
            { onConflict: "organization_id,contact_id", ignoreDuplicates: false },
          );
        if (error) return { ok: false, error: error.message };
        return {
          ok: true,
          ...(args.budget_text
            ? budget
              ? { budget_saved: { min_eur: budget.min, max_eur: budget.max } }
              : { budget_warning: "No se entendió el presupuesto; pregúntale una cifra aproximada." }
            : {}),
        };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  });
}
