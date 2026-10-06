import { createClient } from "@/lib/supabase/server";
import { getOrgBilling } from "@/lib/billing/access";
import { startCheckout, openBillingPortal } from "./actions";
import { formatInTz } from "@/lib/format-date";
import { LANGUAGE_NAMES, PLANS, type PlanFeatures } from "@/lib/billing/plans";

const STATUS_LABEL: Record<string, string> = {
  trialing: "En prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
  unpaid: "Impagada",
  incomplete: "Incompleta",
  incomplete_expired: "Caducada",
  paused: "Pausada",
};


export default async function FacturacionPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; cancel?: string; err?: string; expired?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single<{ organization_id: string; role: "owner" | "staff" }>();
  if (!profile) return null;

  const billing = await getOrgBilling(profile.organization_id);
  const isOwner = profile.role === "owner";
  const inTrial = billing.status === "trialing" && billing.hasAccess;
  const isSubscribed = ["active", "past_due"].includes(billing.status);
  // Hay suscripción viva en Stripe (también "en prueba" tras elegir Pro/Max):
  // no se ofrece contratar otra; los cambios van por el portal.
  const hasSubscription =
    billing.subscribedPlan != null && !["canceled", "incomplete_expired", "unpaid"].includes(billing.status);

  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-semibold">Facturación</h1>

      {params.expired && !billing.hasAccess ? (
        <p className="rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-300">
          Tu prueba ha terminado. Activa la suscripción para seguir usando el panel y el bot de WhatsApp.
        </p>
      ) : null}
      {params.ok ? (
        <p className="text-sm text-emerald-400">
          ¡Gracias! Estamos confirmando tu suscripción; puede tardar unos segundos en reflejarse.
        </p>
      ) : null}
      {params.cancel ? <p className="text-sm text-neutral-400">Has cancelado el proceso de pago.</p> : null}
      {params.err ? <p className="text-sm text-red-400">{params.err}</p> : null}

      <section className="rounded-xl border border-neutral-800 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-medium">Tu plan</h2>
          <p className="text-sm text-neutral-400">Agente IA de WhatsApp para tu agencia.</p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3">
            <dt className="text-neutral-500">Estado</dt>
            <dd className="mt-1 text-white">{STATUS_LABEL[billing.status] ?? billing.status}</dd>
          </div>
          <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3">
            <dt className="text-neutral-500">Plan</dt>
            <dd className="mt-1 text-white">
              {billing.subscribedPlan ? PLANS[billing.subscribedPlan].name : "Prueba gratuita (funciones de Max)"}
            </dd>
          </div>
          {inTrial ? (
            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3">
              <dt className="text-neutral-500">Prueba gratuita</dt>
              <dd className="mt-1 text-white">
                {billing.daysLeft} {billing.daysLeft === 1 ? "día" : "días"} restantes (hasta el{" "}
                {formatInTz(billing.trialEndsAt, null, "date")})
              </dd>
            </div>
          ) : null}
          {billing.currentPeriodEnd && isSubscribed ? (
            <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3">
              <dt className="text-neutral-500">
                {billing.cancelAtPeriodEnd ? "Se cancela el" : "Próxima renovación"}
              </dt>
              <dd className="mt-1 text-white">{formatInTz(billing.currentPeriodEnd, null, "date")}</dd>
            </div>
          ) : null}
        </dl>

        {isOwner ? (
          <div className="flex flex-wrap gap-2">
            {billing.stripeCustomerId ? (
              <form action={openBillingPortal}>
                <button
                  type="submit"
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 transition"
                >
                  {hasSubscription ? "Cambiar de plan o gestionar facturación" : "Gestionar facturación"}
                </button>
              </form>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Solo el propietario de la cuenta puede gestionar la facturación.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Planes</h2>
        {!hasSubscription ? (
          <p className="text-sm text-neutral-400">
            Durante la prueba tienes todas las funciones de Max. Pro y Max respetan los días de prueba que te queden;
            Basic se cobra desde que lo contratas.
          </p>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["basic", "pro", "max"] as const).map((id) => {
            const p = PLANS[id];
            const current = billing.subscribedPlan === id;
            return (
              <div
                key={id}
                className={`rounded-xl border p-5 flex flex-col gap-3 ${current ? "border-white" : "border-neutral-800"}`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">{p.name}</h3>
                    {current ? <span className="text-xs text-emerald-400">Tu plan</span> : null}
                  </div>
                  <p className="mt-1 text-2xl font-semibold">
                    {p.priceEur} €<span className="text-sm font-normal text-neutral-500">/mes</span>
                  </p>
                </div>
                <ul className="flex-1 space-y-1 text-sm text-neutral-300">
                  {planFeatureList(p).map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
                {isOwner && !hasSubscription ? (
                  <form action={startCheckout}>
                    <input type="hidden" name="plan" value={id} />
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-white text-black font-medium px-4 py-2 text-sm hover:bg-neutral-200 transition"
                    >
                      Elegir {p.name}
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function planFeatureList(p: PlanFeatures): string[] {
  return [
    p.maxContacts ? `Hasta ${p.maxContacts} clientes` : "Clientes ilimitados",
    p.calendar ? "Visitas sincronizadas con Google Calendar" : "Visitas en el panel (sin Google Calendar)",
    "Emails de confirmación al cliente",
    p.languages === "all"
      ? "Todos los idiomas (incluidos árabe, chino, japonés…)"
      : `${p.languages.length} idiomas: ${p.languages.map((l) => LANGUAGE_NAMES[l] ?? l).join(", ")}`,
    ...(p.id === "max" ? ["IA avanzada (Claude Sonnet 5.5)", "Mensajes de audio (próximamente)"] : []),
  ];
}
