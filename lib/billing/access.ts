// Estado de facturación de una organización y si tiene acceso al producto.
// Usa el cliente admin: se llama desde el webhook de WhatsApp (sin sesión)
// y desde el layout del dashboard, siempre con un organization_id ya validado.

import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionStatus } from "@/lib/database.types";
import { PLANS, TRIAL_PLAN, type PlanFeatures, type PlanId } from "./plans";

export type OrgBilling = {
  // Plan cuyas funciones se aplican ahora: el contratado en Stripe o, sin
  // suscripción (prueba gratuita), el de prueba (Max).
  plan: PlanFeatures;
  // Plan contratado en Stripe (null si aún no hay suscripción).
  subscribedPlan: PlanId | null;
  status: SubscriptionStatus;
  trialEndsAt: Date;
  daysLeft: number;
  hasAccess: boolean;
  stripeCustomerId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeAccess(status: SubscriptionStatus, trialEndsAt: Date, now = new Date()): boolean {
  if (status === "active" || status === "past_due") return true;
  return status === "trialing" && trialEndsAt.getTime() > now.getTime();
}

export async function getOrgBilling(organizationId: string): Promise<OrgBilling> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("org_subscriptions")
    .select("status, plan, trial_ends_at, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end")
    .eq("organization_id", organizationId)
    .maybeSingle();

  // Sin fila (org creada antes de la migración y sin backfill): sin acceso.
  if (!data) {
    return {
      plan: PLANS[TRIAL_PLAN],
      subscribedPlan: null,
      status: "canceled",
      trialEndsAt: new Date(0),
      daysLeft: 0,
      hasAccess: false,
      stripeCustomerId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  const trialEndsAt = new Date(data.trial_ends_at);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS));

  // Con suscripción en Stripe manda el plan contratado (si el precio no se
  // reconoce, Pro); sin ella, la prueba gratuita da las funciones de Max.
  const subscribedPlan = data.stripe_subscription_id ? (data.plan ?? "pro") : null;

  return {
    plan: PLANS[subscribedPlan ?? TRIAL_PLAN],
    subscribedPlan,
    status: data.status,
    trialEndsAt,
    daysLeft,
    hasAccess: computeAccess(data.status, trialEndsAt, now),
    stripeCustomerId: data.stripe_customer_id,
    currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : null,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  };
}
