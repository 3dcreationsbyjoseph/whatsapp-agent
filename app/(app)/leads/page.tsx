import { createClient } from "@/lib/supabase/server";

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) return null;

  const { data: leads } = await supabase
    .from("leads")
    .select("id, budget_min_eur, budget_max_eur, preferred_locations, preferred_types, min_bedrooms, timeline, financing, language, qualified, notes, created_at, contact:contacts(id, wa_phone, full_name)")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false });

  const fmt = (n?: number | null) => (n == null ? "—" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n));

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Clientes cualificados</h1>
        <p className="text-sm text-neutral-500 mt-1">Perfiles construidos por el asistente a partir de las conversaciones.</p>
      </div>

      {(leads ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center text-neutral-500 text-sm">
          Aún no hay clientes cualificados. Aparecerán aquí a medida que el asistente descubra criterios de búsqueda.
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Presupuesto</th>
                <th className="text-left px-4 py-3">Zonas</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Timeline</th>
                <th className="text-left px-4 py-3">Idioma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {(leads ?? []).map((l) => {
                const c = Array.isArray(l.contact) ? l.contact[0] : l.contact;
                const locs = Array.isArray(l.preferred_locations) ? (l.preferred_locations as string[]) : [];
                const types = Array.isArray(l.preferred_types) ? (l.preferred_types as string[]) : [];
                return (
                  <tr key={l.id} className="hover:bg-neutral-950">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{c?.full_name ?? "—"}</div>
                      <div className="text-xs text-neutral-500">{c?.wa_phone ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {fmt(l.budget_min_eur)} – {fmt(l.budget_max_eur)}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">{locs.join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-neutral-300">{types.join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-neutral-300">{l.timeline ?? "—"}</td>
                    <td className="px-4 py-3 text-neutral-300 uppercase text-xs">{l.language ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
