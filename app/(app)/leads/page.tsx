import Link from "next/link";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import DeleteButton from "../_components/delete-button";
import RealtimeRefresh from "../_components/realtime-refresh";
import { deleteContact } from "./actions";
import { cleanName, displayPhone, readMetadata } from "@/lib/contact-info";
import { formatInTz } from "@/lib/format-date";
import { getOrgBilling } from "@/lib/billing/access";

type Lead = {
  budget_min_eur: number | null;
  budget_max_eur: number | null;
  preferred_locations: unknown;
  preferred_types: unknown;
  min_bedrooms: number | null;
  min_bathrooms: number | null;
  needs_pool: boolean | null;
  needs_sea_view: boolean | null;
  timeline: string | null;
  financing: string | null;
  language: string | null;
  qualified: boolean | null;
  notes: string | null;
};

type Visit = {
  id: string;
  starts_at: string;
  status: string;
  visit_type: string | null;
  property: { title: string; reference: string | null } | { title: string; reference: string | null }[] | null;
};

type ContactRow = {
  id: string;
  wa_phone: string;
  full_name: string | null;
  metadata: unknown;
  created_at: string;
  conversations: { id: string; last_message_at: string }[] | null;
  leads: Lead[] | Lead | null;
  appointments: Visit[] | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const eur = (n?: number | null) =>
  n == null
    ? null
    : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]).filter(Boolean).join(", ") : "");
const yesNo = (v: boolean | null | undefined) => (v == null ? null : v ? "Sí" : "No");
const visitLabel = (t: string | null) => (t === "video_call" ? "Videollamada" : t === "llamada" ? "Llamada" : "Visita presencial");
const statusLabel = (s: string) => (s === "confirmed" ? "confirmada" : s === "cancelled" ? "cancelada" : s === "completed" ? "realizada" : s);

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-200 break-words">{value ?? <span className="text-neutral-600">—</span>}</dd>
    </div>
  );
}

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, organization:organizations(timezone)")
    .eq("id", user.id)
    .single<{ organization_id: string; organization: { timezone: string } | null }>();
  if (!profile) return null;
  const tz = profile.organization?.timezone;

  let query = supabase
    .from("contacts")
    .select(
      "id, wa_phone, full_name, metadata, created_at, conversations(id, last_message_at), " +
        "leads(budget_min_eur, budget_max_eur, preferred_locations, preferred_types, min_bedrooms, min_bathrooms, needs_pool, needs_sea_view, timeline, financing, language, qualified, notes), " +
        "appointments(id, starts_at, status, visit_type, property:properties(title, reference))",
    )
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(200);

  // Quitamos los caracteres con significado en el filtro `or` de PostgREST.
  const term = q.replace(/[,()%*\\]/g, " ").trim();
  if (term) {
    query = query.or(
      `full_name.ilike.%${term}%,wa_phone.ilike.%${term}%,metadata->>contact_phone.ilike.%${term}%,metadata->>email.ilike.%${term}%`,
    );
  }

  const [{ data }, billing, { count: totalContacts }] = await Promise.all([
    query.returns<ContactRow[]>(),
    getOrgBilling(profile.organization_id),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id),
  ]);
  const contacts = data ?? [];
  const now = Date.now();
  const maxContacts = billing.plan.maxContacts;
  const total = totalContacts ?? 0;

  return (
    <div className="max-w-5xl space-y-6">
      <RealtimeRefresh channel="clientes-list" />
      {maxContacts != null ? (
        total > maxContacts ? (
          <div className="rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-300">
            Tienes {total} clientes y tu plan {billing.plan.name} incluye {maxContacts}. El asistente solo responde a
            los {maxContacts} clientes más antiguos: los más recientes no reciben respuesta (sus mensajes sí se guardan).
            Borra clientes que ya no necesites o{" "}
            <Link href="/facturacion" className="underline">pasa a Pro</Link> para tener clientes ilimitados.
          </div>
        ) : (
          <p className="text-sm text-neutral-500">
            {total} de {maxContacts} clientes incluidos en tu plan {billing.plan.name}.
          </p>
        )
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Cada persona que escribe por WhatsApp aparece aquí automáticamente. Pulsa un cliente para ver toda su información.
          </p>
        </div>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, teléfono o email"
            className="w-72 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900 transition"
          >
            Buscar
          </button>
        </form>
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center text-neutral-500 text-sm">
          {term
            ? "Ningún cliente coincide con la búsqueda."
            : "Aún no hay clientes. Aparecerán aquí en cuanto alguien escriba por WhatsApp."}
        </div>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => {
            const lead = Array.isArray(c.leads) ? c.leads[0] : c.leads;
            const conv = (c.conversations ?? [])
              .slice()
              .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))[0];
            const visits = (c.appointments ?? []).slice().sort((a, b) => b.starts_at.localeCompare(a.starts_at));
            const nextVisit = visits
              .filter((v) => v.status === "confirmed" && new Date(v.starts_at).getTime() > now)
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
            const meta = readMetadata(c.metadata);
            const realName = cleanName(c.full_name);
            const isNew = now - new Date(c.created_at).getTime() < DAY_MS;
            const bMin = lead?.budget_min_eur || null;
            const bMax = lead?.budget_max_eur || null;
            const budget =
              bMin && bMax ? `${eur(bMin)} – ${eur(bMax)}` : bMax ? `hasta ${eur(bMax)}` : bMin ? `desde ${eur(bMin)}` : null;

            return (
              <li key={c.id}>
                <details className="group rounded-xl border border-neutral-800 bg-neutral-950/40 open:bg-neutral-950">
                  {/* Cabecera: lo básico */}
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white">
                          {realName ?? displayPhone(meta.contact_phone ?? c.wa_phone)}
                        </span>
                        {isNew ? (
                          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] uppercase tracking-wide px-2 py-0.5">
                            Nuevo
                          </span>
                        ) : null}
                        {nextVisit ? (
                          <span className="rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[10px] uppercase tracking-wide px-2 py-0.5">
                            Visita {formatInTz(nextVisit.starts_at, tz)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-400">
                        {meta.contact_phone ? displayPhone(meta.contact_phone) : "Teléfono no facilitado"}
                        {meta.email ? ` · ${meta.email}` : ""}
                      </div>
                    </div>
                    <div className="hidden sm:block text-right text-xs text-neutral-500">
                      {conv ? (
                        <>
                          Último mensaje
                          <div className="text-neutral-300">{formatInTz(conv.last_message_at, tz)}</div>
                        </>
                      ) : null}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-neutral-400 group-open:text-white">
                      <span className="group-open:hidden">Más información</span>
                      <span className="hidden group-open:inline">Ocultar</span>
                      <CaretDownIcon size={14} className="transition group-open:rotate-180" />
                    </span>
                  </summary>

                  {/* Desplegable: toda la información */}
                  <div className="border-t border-neutral-900 px-5 py-5 space-y-6">
                    <section>
                      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">Contacto</h3>
                      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Item label="Nombre completo" value={realName} />
                        <Item label="Teléfono de contacto" value={meta.contact_phone ? displayPhone(meta.contact_phone) : null} />
                        <Item label="Email" value={meta.email ? <a href={`mailto:${meta.email}`} className="hover:underline">{meta.email}</a> : null} />
                        <Item label="WhatsApp" value={displayPhone(c.wa_phone)} />
                        <Item label="Idioma" value={lead?.language?.toUpperCase() ?? null} />
                        <Item label="Primer contacto" value={formatInTz(c.created_at, tz)} />
                      </dl>
                    </section>

                    <section>
                      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">Qué busca</h3>
                      {lead ? (
                        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <Item label="Presupuesto" value={budget} />
                          <Item label="Zonas" value={list(lead.preferred_locations) || null} />
                          <Item label="Tipo" value={list(lead.preferred_types) || null} />
                          <Item label="Dormitorios mín." value={lead.min_bedrooms} />
                          <Item label="Baños mín." value={lead.min_bathrooms} />
                          <Item label="Piscina" value={yesNo(lead.needs_pool)} />
                          <Item label="Vistas al mar" value={yesNo(lead.needs_sea_view)} />
                          <Item label="Plazo" value={lead.timeline} />
                          <Item label="Financiación" value={lead.financing} />
                          {lead.notes ? (
                            <div className="sm:col-span-3">
                              <Item label="Notas" value={lead.notes} />
                            </div>
                          ) : null}
                        </dl>
                      ) : (
                        <p className="text-sm text-neutral-500">El asistente todavía no ha recogido sus preferencias.</p>
                      )}
                    </section>

                    <section>
                      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">Visitas</h3>
                      {visits.length ? (
                        <ul className="space-y-1.5 text-sm">
                          {visits.map((v) => {
                            const p = Array.isArray(v.property) ? v.property[0] : v.property;
                            return (
                              <li key={v.id} className="flex flex-wrap gap-x-2 text-neutral-300">
                                <span className="text-white">{formatInTz(v.starts_at, tz, "long")}</span>
                                <span>· {visitLabel(v.visit_type)}</span>
                                {p ? <span>· {p.title}{p.reference ? ` (${p.reference})` : ""}</span> : null}
                                <span className="text-neutral-500">· {statusLabel(v.status)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-sm text-neutral-500">Sin visitas agendadas.</p>
                      )}
                    </section>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-900 pt-4">
                      {conv ? (
                        <Link
                          href={`/conversaciones/${conv.id}`}
                          className="rounded-lg bg-white text-black font-medium px-4 py-2 text-sm hover:bg-neutral-200 transition"
                        >
                          Ver conversación
                        </Link>
                      ) : (
                        <span />
                      )}
                      <DeleteButton
                        action={deleteContact.bind(null, c.id)}
                        label="Borrar cliente"
                        confirmText={`¿Borrar a ${realName ?? displayPhone(c.wa_phone)}? Se borrarán también sus conversaciones, mensajes, lead y visitas guardadas en la app. Las visitas ya agendadas en Google Calendar no se borran.`}
                      />
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
