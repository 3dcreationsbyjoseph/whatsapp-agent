import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE, formatInTz } from "@/lib/format-date";
import { googleCalendarDayUrl, googleCalendarUrl } from "@/lib/google/links";
import { cleanName, displayPhone, readMetadata } from "@/lib/contact-info";
import { ArrowSquareOutIcon, CalendarBlankIcon } from "@phosphor-icons/react/dist/ssr";
import ActionButton from "../_components/action-button";
import RealtimeRefresh from "../_components/realtime-refresh";
import { cancelVisit, completeVisit, deleteVisit } from "./actions";

type VisitProperty = { title: string; location: string; reference: string | null; price_eur: number | null };
type VisitContact = {
  id: string;
  wa_phone: string;
  full_name: string | null;
  metadata: unknown;
  conversations: { id: string }[] | { id: string } | null;
};
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
  contact: VisitContact | VisitContact[] | null;
};

const TABS = [
  { key: "proximas", label: "Próximas" },
  { key: "pasadas", label: "Pasadas" },
  { key: "canceladas", label: "Canceladas" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const visitLabel = (t: string | null) => (t === "video_call" ? "videollamada" : t === "llamada" ? "llamada" : "presencial");
const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "confirmada", cls: "border-emerald-500/40 text-emerald-400" },
  completed: { label: "realizada", cls: "border-sky-500/40 text-sky-300" },
  cancelled: { label: "cancelada", cls: "border-neutral-700 text-neutral-500" },
};
const eur = (n?: number | null) =>
  n == null ? "" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export default async function VisitasPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === vista) ? (vista as Tab) : "proximas";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, organization:organizations(timezone)")
    .eq("id", user.id)
    .single<{ organization_id: string; organization: { timezone: string } | null }>();
  if (!profile) return null;
  const tz = profile.organization?.timezone ?? DEFAULT_TIMEZONE;

  const { data: gcal } = await supabase
    .from("google_calendar_configs")
    .select("calendar_id")
    .eq("organization_id", profile.organization_id)
    .maybeSingle<{ calendar_id: string }>();
  const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz }); // YYYY-MM-DD

  const nowIso = new Date().toISOString();
  let query = supabase
    .from("appointments")
    .select(
      "id, service, visit_type, starts_at, ends_at, status, full_name, phone, notes, created_at, google_event_id, " +
        "property:properties(title, location, reference, price_eur), " +
        "contact:contacts(id, wa_phone, full_name, metadata, conversations(id))",
    )
    .eq("organization_id", profile.organization_id);
  if (tab === "proximas") query = query.eq("status", "confirmed").gte("starts_at", nowIso).order("starts_at", { ascending: true });
  else if (tab === "pasadas") query = query.neq("status", "cancelled").lt("starts_at", nowIso).order("starts_at", { ascending: false });
  else query = query.eq("status", "cancelled").order("starts_at", { ascending: false });

  const { data: rows } = await query.limit(200).returns<VisitRow[]>();
  const grouped = groupByDay(rows ?? [], tz);

  return (
    <div className="max-w-5xl space-y-6">
      <RealtimeRefresh channel="visitas-list" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Visitas</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Gestiona las visitas y llamadas reservadas. Los cambios se reflejan en Google Calendar.
          </p>
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
          <Link
            href="/integraciones"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 transition"
          >
            <CalendarBlankIcon size={16} />
            Conectar Google Calendar
          </Link>
        )}
      </div>

      <nav className="flex gap-1 border-b border-neutral-900">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/visitas?vista=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
              tab === t.key ? "border-white text-white" : "border-transparent text-neutral-500 hover:text-neutral-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center text-neutral-500 text-sm">
          {tab === "proximas" ? "No hay visitas próximas." : tab === "pasadas" ? "No hay visitas pasadas." : "No hay visitas canceladas."}
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
                const contact = Array.isArray(a.contact) ? a.contact[0] : a.contact;
                const convs = contact?.conversations;
                const convId = Array.isArray(convs) ? convs[0]?.id : convs?.id;
                const meta = readMetadata(contact?.metadata);
                const clientName = cleanName(contact?.full_name) ?? a.full_name;
                const status = STATUS[a.status] ?? { label: a.status, cls: "border-neutral-700 text-neutral-400" };
                const isFuture = new Date(a.starts_at).getTime() > Date.now();
                return (
                  <li key={a.id} className="px-5 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white flex flex-wrap items-center gap-2">
                          <span>{formatInTz(a.starts_at, tz, "time")}</span>
                          <span className="text-xs uppercase tracking-wide rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-neutral-400">
                            {visitLabel(a.visit_type)}
                          </span>
                          <span>{clientName}</span>
                        </div>
                        {property ? (
                          <div className="text-sm text-neutral-300 mt-1 truncate">
                            {property.title}{property.reference ? ` · ${property.reference}` : ""}
                            <span className="text-neutral-500"> · {property.location}{property.price_eur ? ` · ${eur(Number(property.price_eur))}` : ""}</span>
                          </div>
                        ) : null}
                        <div className="text-xs text-neutral-500 mt-1">
                          Tel. {displayPhone(a.phone)}
                          {meta.email ? ` · ${meta.email}` : ""}
                          {a.notes ? ` · ${a.notes}` : ""}
                        </div>
                        <div className="text-xs text-neutral-600 mt-1">
                          Reservada el {formatInTz(a.created_at, tz)}
                          {a.status === "confirmed" && !a.google_event_id ? (
                            <span className="ml-2 rounded-full border border-amber-500/40 px-2 py-0.5 text-amber-400">
                              Pendiente de Google Calendar
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${status.cls}`}>{status.label}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {convId ? (
                        <Link
                          href={`/conversaciones/${convId}`}
                          className="rounded-lg border border-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-900 hover:text-white transition"
                        >
                          Conversación
                        </Link>
                      ) : null}
                      {contact ? (
                        <Link
                          href={`/leads?q=${encodeURIComponent(contact.wa_phone)}`}
                          className="rounded-lg border border-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-900 hover:text-white transition"
                        >
                          Ficha del cliente
                        </Link>
                      ) : null}
                      {gcal && a.google_event_id ? (
                        <a
                          href={googleCalendarDayUrl(gcal.calendar_id, ymdFmt.format(new Date(a.starts_at)))}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-900 hover:text-white transition"
                        >
                          En Google Calendar ↗
                        </a>
                      ) : null}
                      <span className="flex-1" />
                      {a.status === "confirmed" && !isFuture ? (
                        <ActionButton action={completeVisit.bind(null, a.id)} label="Marcar realizada" pendingLabel="Guardando…" />
                      ) : null}
                      {a.status === "confirmed" && isFuture ? (
                        <ActionButton
                          action={cancelVisit.bind(null, a.id)}
                          label="Cancelar visita"
                          pendingLabel="Cancelando…"
                          variant="danger"
                          confirmText={`¿Cancelar la visita de ${clientName} del ${formatInTz(a.starts_at, tz, "long")}? Se quitará de Google Calendar y, si dio su email, se le avisará por correo.`}
                        />
                      ) : null}
                      <ActionButton
                        action={deleteVisit.bind(null, a.id)}
                        label="Eliminar"
                        pendingLabel="Eliminando…"
                        variant="danger"
                        confirmText={`¿Eliminar definitivamente esta visita de ${clientName}? Se borra de la app y de Google Calendar. No se avisa al cliente (para avisarle, usa «Cancelar visita»).`}
                      />
                    </div>
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
