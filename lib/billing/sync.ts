// Sincroniza una suscripción de Stripe con public.org_subscriptions.
// Idempotente: siempre relee la suscripción y hace upsert del estado actual,
// así reintentos o eventos fuera de orden convergen al mismo resultado.

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionStatus } from "@/lib/database.types";
import { planFromStripePrice, type PlanId } from "./plans";

const KNOWN_STATUSES: readonly SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
];

function toStatus(s: string): SubscriptionStatus {
  return (KNOWN_STATUSES as readonly string[]).includes(s) ? (s as SubscriptionStatus) : "incomplete";
}

function customerId(c: string | Stripe.Customer | Stripe.DeletedCustomer): string {
  return typeof c === "string" ? c : c.id;
}

// Resuelve la organización: primero metadata de la suscripción, si no por customer id.
async function resolveOrgId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.organization_id;
  if (fromMeta) return fromMeta;
  const admin = createAdminClient();
  const { data } = await admin
    .from("org_subscriptions")
    .select("organization_id")
    .eq("stripe_customer_id", customerId(sub.customer))
    .maybeSingle();
  return data?.organization_id ?? null;
}

export async function syncSubscription(sub: Stripe.Subscription): Promise<{ organization_id: string | null }> {
  const organization_id = await resolveOrgId(sub);
  if (!organization_id) return { organization_id: null };

  // Desde la API 2025-03 el periodo vive en los items de la suscripción.
  const periodEnds = sub.items.data.map((i) => i.current_period_end).filter((n): n is number => !!n);
  const periodEnd = periodEnds.length ? Math.min(...periodEnds) : null;

  // Plan según el precio contratado (si hay varios items, el primero reconocido).
  const plan =
    sub.items.data.map((i) => planFromStripePrice(i.price?.id)).find((p): p is PlanId => p != null) ?? null;

  const admin = createAdminClient();
  const row = {
    organization_id,
    status: toStatus(sub.status),
    ...(plan ? { plan } : {}),
    stripe_customer_id: customerId(sub.customer),
    stripe_subscription_id: sub.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
    // Mientras está en prueba en Stripe, su trial_end es la fuente de verdad.
    ...(sub.status === "trialing" && sub.trial_end
      ? { trial_ends_at: new Date(sub.trial_end * 1000).toISOString() }
      : {}),
  };
  const { error } = await admin.from("org_subscriptions").upsert(row, { onConflict: "organization_id" });
  if (error) throw new Error(error.message);
  return { organization_id };
}
