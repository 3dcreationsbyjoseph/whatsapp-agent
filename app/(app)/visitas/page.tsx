import { createClient } from "@/lib/supabase/server";

export default async function VisitasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", profile.organization_id)
    .single();
  const tz = org?.timezone ?? "Europe/Madrid";

  const now = new Date();
  const inTwoMonths = new Date(now);
  inTwoMonths.setMonth(inTwoMonths.getMonth() + 2);

  const { data: rows } = await supabase
    .from("appointments")
    .select("id, service, visit_type, starts_at, ends_at, status, full_name, phone, notes, property:properties(title, location, reference, price_eur)")
    .eq("organization_id", profile.organization_id)
    .neq("status", "cancelled")
    .gte("starts_at", now.toISOString())
    .lt("starts_at", inTwoMonths.toISOString())
    .order("starts_at", { ascending: true });

  const grouped = groupByDay(rows ?? [], tz);
  const fmt = (n?: number | null) => (n == null ? "—" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n));

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Visitas agendadas</h1>
        <p className="text-sm text-neutral-500 mt-1">Próximas visitas a propiedades y llamadas informativas.</p>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center text-neutral-500 text-sm">
          No hay visitas próximas.
        </div>
      ) : (
        grouped.map(([day, items]) => (
          <section key={day} className="space-y-2">
            <h2 className="text-xs uppercase tracking-wide text-neutral-500">{day}</h2>
            <ul className="rounded-xl border border-neutral-800 divide-y divide-neutral-900 overflow-hidden">
              {items.map((a) => {
                const property = Array.isArray(a.property) ? a.property[0] : a.property;
                return (
                  <li key={a.id} className="px-5 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white flex items-center gap-2">
                        <span>{new Date(a.starts_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz })}</span>
                        <span className="text-xs uppercase tracking-wide rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-neutral-400">
                          {a.visit_type === "video_call" ? "video llamada" : a.visit_type === "llamada" ? "llamada" : "presencial"}
                        </span>
                      </div>
                      {property ? (
                        <div className="text-sm text-neutral-300 mt-1 truncate">
                          {property.title}{property.reference ? ` · ${property.reference}` : ""}
                          <span className="text-neutral-500"> · {property.location}</span>
                        </div>
                      ) : null}
                      <div className="text-xs text-neutral-500 mt-1">
                        {a.full_name} · {a.phone}
                        {property?.price_eur ? ` · ${fmt(Number(property.price_eur))}` : ""}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${a.status === "confirmed" ? "border-emerald-500/40 text-emerald-400" : "border-neutral-700 text-neutral-400"}`}>
                      {a.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function groupByDay<T extends { starts_at: string }>(items: T[], timeZone: string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const day = new Date(item.starts_at).toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    });
    const arr = groups.get(day) ?? [];
    arr.push(item);
    groups.set(day, arr);
  }
  return Array.from(groups.entries());
}
