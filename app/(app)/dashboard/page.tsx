import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  if (!profile) return null;
  const orgId = profile.organization_id;

  const { data: org } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", orgId)
    .single();
  const tz = org?.timezone ?? "Europe/Madrid";

  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: convs30 }, { count: visitsWeek }, { count: leadsTotal }, { count: propertiesActive }, { data: recent }] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("last_message_at", since30),
    (async () => {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day;
      startOfWeek.setUTCDate(startOfWeek.getUTCDate() + diff);
      startOfWeek.setUTCHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 7);
      return supabase.from("appointments").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "confirmed").gte("starts_at", startOfWeek.toISOString()).lt("starts_at", endOfWeek.toISOString());
    })(),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "available"),
    supabase.from("conversations").select("id, last_message_at, contact:contacts(wa_phone, full_name)").eq("organization_id", orgId).order("last_message_at", { ascending: false }).limit(5),
  ]);

  return (
    <div className="max-w-6xl space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Panel</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Conversaciones (30 días)" value={convs30 ?? 0} />
        <Card label="Visitas esta semana" value={visitsWeek ?? 0} />
        <Card label="Clientes cualificados" value={leadsTotal ?? 0} />
        <Card label="Propiedades activas" value={propertiesActive ?? 0} />
      </div>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-neutral-500">Últimas conversaciones</h2>
        <ul className="rounded-xl border border-neutral-900 divide-y divide-neutral-900 overflow-hidden">
          {(recent ?? []).map((c) => {
            const contact = Array.isArray(c.contact) ? c.contact[0] : c.contact;
            return (
              <li key={c.id}>
                <Link href={`/conversaciones/${c.id}`} className="block px-5 py-4 hover:bg-neutral-950 transition">
                  <div className="text-sm font-medium text-white">{contact?.full_name ?? contact?.wa_phone ?? "Sin nombre"}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{new Date(c.last_message_at).toLocaleString("es-ES", { timeZone: tz })}</div>
                </Link>
              </li>
            );
          })}
          {(recent ?? []).length === 0 && (
            <li className="px-5 py-4 text-sm text-neutral-500">Aún no hay conversaciones.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-5">
      <div className="text-xs uppercase tracking-widest text-neutral-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
    </div>
  );
}
