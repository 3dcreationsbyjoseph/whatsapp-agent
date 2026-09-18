import { createClient } from "@/lib/supabase/server";

export default async function CitasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) return null;

  const now = new Date();
  const inTwoMonths = new Date(now);
  inTwoMonths.setMonth(inTwoMonths.getMonth() + 2);

  const { data: appts } = await supabase
    .from("appointments")
    .select("id, service, starts_at, ends_at, status, full_name, phone, is_new_patient, notes")
    .eq("organization_id", profile.organization_id)
    .neq("status", "cancelled")
    .gte("starts_at", now.toISOString())
    .lt("starts_at", inTwoMonths.toISOString())
    .order("starts_at", { ascending: true });

  const grouped = groupByDay(appts ?? []);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Citas</h1>
      {grouped.length === 0 ? (
        <p className="text-sm text-neutral-500">No hay citas próximas.</p>
      ) : (
        grouped.map(([day, items]) => (
          <section key={day} className="space-y-2">
            <h2 className="text-sm uppercase tracking-wide text-neutral-400">{day}</h2>
            <ul className="rounded-lg border border-neutral-800 divide-y divide-neutral-800">
              {items.map((a) => (
                <li key={a.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      {new Date(a.starts_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · {a.service}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {a.full_name} · {a.phone}
                      {a.is_new_patient ? " · nuevo" : ""}
                    </div>
                  </div>
                  <span
                    className={
                      "text-xs px-2 py-0.5 rounded-full border " +
                      (a.status === "confirmed"
                        ? "border-emerald-500/40 text-emerald-400"
                        : a.status === "cancelled"
                        ? "border-red-500/40 text-red-400"
                        : "border-neutral-700 text-neutral-400")
                    }
                  >
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function groupByDay<T extends { starts_at: string }>(items: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const day = new Date(item.starts_at).toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const arr = groups.get(day) ?? [];
    arr.push(item);
    groups.set(day, arr);
  }
  return Array.from(groups.entries());
}
