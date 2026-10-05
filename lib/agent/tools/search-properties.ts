import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { rankProperties, type PropertyRow } from "../property-matching";

// Catálogo de una agencia: cabe en memoria. Filtramos en código para poder
// tolerar sinónimos, tildes y criterios aproximados (ver property-matching.ts).
const MAX_CATALOG = 500;

export function makeSearchPropertiesTool(ctx: { organization_id: string }) {
  return tool({
    description:
      "Busca propiedades disponibles. TODOS los filtros son opcionales: pasa solo lo que el cliente haya dicho, nunca inventes valores. Entiende sinónimos (villa = chalet = casa = house), tildes y otros idiomas. Dormitorios/baños son mínimos y el precio admite ~10% de margen. Si no hay coincidencias exactas devuelve las más parecidas con match='similar' y sus diferencias. Cada resultado trae `ref`: úsala para referirte a la propiedad y para send_property_to_client / book_visit.",
    inputSchema: z.object({
      min_price_eur: z.number().nonnegative().nullish(),
      max_price_eur: z.number().nonnegative().nullish(),
      locations: z.array(z.string()).nullish().describe("Zonas, ej. ['Jávea','Moraira']"),
      property_types: z
        .array(z.string())
        .nullish()
        .describe("Tipo tal como lo dijo el cliente, ej. ['villa'] o ['apartment']"),
      min_bedrooms: z.number().int().nonnegative().nullish(),
      min_bathrooms: z.number().int().nonnegative().nullish(),
      needs_pool: z.boolean().nullish(),
      needs_sea_view: z.boolean().nullish(),
      limit: z.number().int().min(1).max(5).default(3),
    }),
    execute: async (args) => {
      try {
        const admin = createAdminClient();
        const { data, error } = await admin
          .from("properties")
          .select(
            "id, reference, title, location, property_type, price_eur, bedrooms, bathrooms, built_area_m2, plot_area_m2, features",
          )
          .eq("organization_id", ctx.organization_id)
          .eq("status", "available")
          .limit(MAX_CATALOG);
        if (error) return { ok: false, error: `No se pudo consultar el catálogo: ${error.message}` };

        // database.types.ts aún no incluye `properties` (placeholder): cast explícito.
        const rows = (data ?? []) as unknown as PropertyRow[];
        const { match, results } = rankProperties(rows, args, args.limit ?? 3);

        return {
          ok: true,
          match,
          note:
            match === "exact"
              ? "Coinciden con lo que pidió el cliente."
              : match === "similar"
                ? "No hay coincidencias exactas. Son las más parecidas: díselo al cliente con naturalidad y menciona en qué difieren."
                : "No hay propiedades parecidas en el catálogo. Pregunta si puede flexibilizar algún criterio o ofrece una llamada con un agente.",
          // Compacto: este resultado se reenvía al modelo en cada paso del turno.
          properties: results.map(({ row, differences }) => ({
            ref: row.reference ?? row.id,
            id: row.id,
            title: row.title,
            location: row.location,
            type: row.property_type,
            price_eur: Number(row.price_eur),
            bedrooms: row.bedrooms,
            bathrooms: row.bathrooms,
            built_m2: row.built_area_m2,
            plot_m2: row.plot_area_m2,
            features: Array.isArray(row.features) ? (row.features as unknown[]).slice(0, 5) : [],
            ...(differences.length ? { differences } : {}),
          })),
        };
      } catch (err) {
        return { ok: false, error: `Error buscando propiedades: ${(err as Error).message}` };
      }
    },
  });
}
