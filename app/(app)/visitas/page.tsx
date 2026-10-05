import { createClient } from "@/lib/supabase/server";
import { formatInTz } from "@/lib/format-date";
import { googleCalendarDayUrl, googleCalendarUrl } from "@/lib/google/links";
import { ArrowSquareOutIcon, CalendarBlankIcon } from "@phosphor-icons/react/dist/ssr";

type VisitProperty = { title: string; location: string; reference: string | null; price_eur: number | null };
type VisitRow = {
  id: string;
  service: string;
  visit_type: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  full_name: string;
  phone: string;
  notes: string | null;
  created_at: string;
  google_event_id: string | null;
  property: VisitProperty | VisitProperty[] | null;
};

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

  const { data: gcal } = await supabase
    .from("google_calendar_configs")
    .select("calendar_id")
    .eq("organization_id", profile.organization_id)
    .maybeSingle<{ calendar_id: string }>();
  const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz }); // YYYY-MM-DD

  const now = new Date();
  const inTwoMonths = new Date(now);
  inTwoMonths.setMonth(inTwoMonths.getMonth() + 2);

  const { data: rows } = await supabase
    .from("appointments")
    .select("id, service, visit_type, starts_at, ends_at, status, full_name, phone, notes, created_at, google_event_id, property:properties(title, location, reference, price_eur)")
    .eq("organization_id", profile.organization_id)
    .neq("status", "cancelled")
    .gte("starts_at", now.toISOString())
    .lt("starts_at", inTwoMonths.toISOString())
    .order("starts_at", { ascending: true })
    .returns<VisitRow[]>();

  const grouped = groupByDay(rows ?? [], tz);
  const fmt = (n?: number | null) => (n == null ? "—" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n));

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Visitas agendadas</h1>
          <p className="text-sm text-neutral-500 mt-1">Próximas visitas a propiedades y llamadas informativas.</p>
        </div>
        {gcal ? (
          <a
            href={googleCalendarUrl(gcal.calendar_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-white text-black font-medium px-4 py-2 text-sm hover:bg-neutral-200 transition"
          >
            <CalendarBlankIcon size={16} />
            Abrir Google Calendar
            <ArrowSquareOutIcon size={14} />
          </a>
        ) : (
          <a
            href="/integraciones"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 transition"
          >
            <CalendarBlankIcon size={16} />
            Conectar Google Calendar
          </a>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center text-neutral-500 text-sm">
          No hay visitas próximas.
        </div>
      ) : (
        grouped.map(([day, items]) => (
          <section key={day} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs uppercase tracking-wide text-neutral-500">{day}</h2>
              {gcal ? (
                <a
                  href={googleCalendarDayUrl(gcal.calendar_id, ymdFmt.format(new Date(items[0].starts_at)))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition"
                >
                  Ver este día en Google Calendar
                  <ArrowSquareOutIcon size={12} />
                </a>
              ) : null}
            </div>
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
                      <div className="text-xs text-neutral-600 mt-1">
                        Reservada el {formatInTz(a.created_at, tz)}
                        {!a.google_event_id ? (
                          <span className="ml-2 rounded-full border border-amber-500/40 px-2 py-0.5 text-amber-400">
                            Pendiente de Google Calendar
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${a.status === "confirmed" ? "border-emerald-500/40 text-emerald-400" : "border-neutral-700 text-neutral-400"}`}>
                      {a.status === "confirmed" ? "confirmada" : a.status === "completed" ? "realizada" : a.status}
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
