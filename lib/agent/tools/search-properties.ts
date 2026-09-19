import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export function makeSearchPropertiesTool(ctx: { organization_id: string }) {
  return tool({
    description:
      "Busca propiedades disponibles según criterios del cliente (presupuesto, ubicación, dormitorios, etc.). Devuelve una lista breve con id, ref, título, ubicación, precio, dormitorios, baños y features destacadas. Úsala en cuanto el cliente indique lo que busca.",
    inputSchema: z.object({
      min_price_eur: z.number().int().nonnegative().optional(),
      max_price_eur: z.number().int().nonnegative().optional(),
      locations: z
        .array(z.string())
        .optional()
        .describe("Ej. ['Jávea','Moraira','Denia','Calpe','Altea']"),
      property_types: z
        .array(z.string())
        .optional()
        .describe("Ej. ['villa','chalet','apartamento','ático','casa rural']"),
      min_bedrooms: z.number().int().nonnegative().optional(),
      min_bathrooms: z.number().int().nonnegative().optional(),
      needs_pool: z.boolean().optional(),
      needs_sea_view: z.boolean().optional(),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    execute: async (args) => {
      const admin = createAdminClient();
      let q = admin
        .from("properties")
        .select(
          "id, reference, title, location, property_type, price_eur, bedrooms, bathrooms, built_area_m2, plot_area_m2, features, photo_urls",
        )
        .eq("organization_id", ctx.organization_id)
        .eq("status", "available");

      if (args.min_price_eur !== undefined) q = q.gte("price_eur", args.min_price_eur);
      if (args.max_price_eur !== undefined) q = q.lte("price_eur", args.max_price_eur);
      if (args.min_bedrooms !== undefined) q = q.gte("bedrooms", args.min_bedrooms);
      if (args.min_bathrooms !== undefined) q = q.gte("bathrooms", args.min_bathrooms);
      if (args.locations && args.locations.length > 0) q = q.in("location", args.locations);
      if (args.property_types && args.property_types.length > 0)
        q = q.in("property_type", args.property_types);

      const { data, error } = await q.limit(args.limit);
      if (error) return { ok: false, error: error.message };

      const rows = (data ?? []).filter((r) => {
        const feats = Array.isArray(r.features) ? (r.features as string[]) : [];
        const lowered = feats.map((f) => String(f).toLowerCase());
        if (args.needs_pool && !lowered.some((f) => f.includes("pisc") || f.includes("pool"))) return false;
        if (args.needs_sea_view && !lowered.some((f) => f.includes("mar") || f.includes("sea"))) return false;
        return true;
      });

      return {
        ok: true,
        count: rows.length,
        properties: rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          title: r.title,
          location: r.location,
          type: r.property_type,
          price_eur: r.price_eur,
          bedrooms: r.bedrooms,
          bathrooms: r.bathrooms,
          built_area_m2: r.built_area_m2,
          plot_area_m2: r.plot_area_m2,
          features: r.features,
          has_photos: Array.isArray(r.photo_urls) && r.photo_urls.length > 0,
        })),
      };
    },
  });
}
