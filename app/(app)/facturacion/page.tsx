import { createClient } from "@/lib/supabase/server";
import { getOrgBilling } from "@/lib/billing/access";
import { startCheckout, openBillingPortal } from "./actions";
import { formatInTz } from "@/lib/format-date";

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

  return (
    <div className="max-w-3xl space-y-8">
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
            {!isSubscribed ? (
              <form action={startCheckout}>
                <button
                  type="submit"
                  className="rounded-lg bg-white text-black font-medium px-4 py-2 text-sm hover:bg-neutral-200 transition"
                >
                  Activar suscripción
                </button>
              </form>
            ) : null}
            {billing.stripeCustomerId ? (
              <form action={openBillingPortal}>
                <button
                  type="submit"
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 transition"
                >
                  Gestionar facturación
                </button>
              </form>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Solo el propietario de la cuenta puede gestionar la facturación.</p>
        )}
      </section>
    </div>
  );
}
