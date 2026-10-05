import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DeleteButton from "../_components/delete-button";
import RealtimeRefresh from "../_components/realtime-refresh";
import { deleteContact } from "./actions";

type Lead = {
  budget_min_eur: number | null;
  budget_max_eur: number | null;
  preferred_locations: unknown;
  preferred_types: unknown;
  timeline: string | null;
  language: string | null;
  qualified: boolean | null;
};

type ContactRow = {
  id: string;
  wa_phone: string;
  full_name: string | null;
  created_at: string;
  conversations: { id: string; last_message_at: string }[] | null;
  leads: Lead[] | Lead | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const dateFmt = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });
const eur = (n?: number | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single<{ organization_id: string }>();
  if (!profile) return null;

  let query = supabase
    .from("contacts")
    .select(
      "id, wa_phone, full_name, created_at, conversations(id, last_message_at), leads(budget_min_eur, budget_max_eur, preferred_locations, preferred_types, timeline, language, qualified)",
    )
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(200);

  // Quitamos los caracteres con significado en el filtro `or` de PostgREST.
  const term = q.replace(/[,()%*\\]/g, " ").trim();
  if (term) query = query.or(`full_name.ilike.%${term}%,wa_phone.ilike.%${term}%`);

  const { data } = await query.returns<ContactRow[]>();
  const contacts = data ?? [];
  const now = Date.now();

  return (
    <div className="max-w-6xl space-y-6">
      <RealtimeRefresh channel="clientes-list" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Cada persona que escribe por WhatsApp aparece aquí automáticamente, con el perfil que va construyendo el asistente.
          </p>
        </div>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre o teléfono"
            className="w-64 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
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
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Último mensaje</th>
                <th className="text-left px-4 py-3">Presupuesto</th>
                <th className="text-left px-4 py-3">Zonas / tipo</th>
                <th className="text-left px-4 py-3">Idioma</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {contacts.map((c) => {
                const lead = Array.isArray(c.leads) ? c.leads[0] : c.leads;
                const conv = (c.conversations ?? [])
                  .slice()
                  .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))[0];
                const locs = Array.isArray(lead?.preferred_locations) ? (lead.preferred_locations as string[]) : [];
                const types = Array.isArray(lead?.preferred_types) ? (lead.preferred_types as string[]) : [];
                const isNew = now - new Date(c.created_at).getTime() < DAY_MS;
                const name = (
                  <span className="font-medium text-white">{c.full_name ?? "Sin nombre"}</span>
                );
                return (
                  <tr key={c.id} className="hover:bg-neutral-950">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {conv ? (
                          <Link href={`/conversaciones/${conv.id}`} className="hover:underline underline-offset-4">
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                        {isNew ? (
                          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] uppercase tracking-wide px-2 py-0.5">
                            Nuevo
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-neutral-500">{c.wa_phone}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {conv ? dateFmt.format(new Date(conv.last_message_at)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {lead ? `${eur(lead.budget_min_eur)} – ${eur(lead.budget_max_eur)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {[locs.join(", "), types.join(", ")].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-300 uppercase text-xs">{lead?.language ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <DeleteButton
                        action={deleteContact.bind(null, c.id)}
                        confirmText={`¿Borrar a ${c.full_name ?? c.wa_phone}? Se borrarán también sus conversaciones, mensajes, lead y visitas guardadas en la app. Las visitas ya agendadas en Google Calendar no se borran.`}
                      />
                    </td>
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
