"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/billing/stripe";

// Stripe exige que trial_end esté al menos 48 h en el futuro.
const MIN_TRIAL_MS = 48 * 60 * 60 * 1000;

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single<{ organization_id: string; role: "owner" | "staff" }>();
  if (!profile) redirect("/login");
  if (profile.role !== "owner") {
    redirect("/facturacion?err=" + encodeURIComponent("Solo el propietario de la cuenta puede gestionar la facturación."));
  }
  return { user, organization_id: profile.organization_id };
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function startCheckout() {
  const { user, organization_id } = await requireOwner();
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) redirect("/facturacion?err=" + encodeURIComponent("Falta configurar STRIPE_PRICE_ID."));

  const admin = createAdminClient();
  const stripe = getStripe();

  const [{ data: sub }, { data: org }] = await Promise.all([
    admin
      .from("org_subscriptions")
      .select("stripe_customer_id, trial_ends_at")
      .eq("organization_id", organization_id)
      .maybeSingle(),
    admin.from("organizations").select("name").eq("id", organization_id).single(),
  ]);

  // Reutiliza el customer o créalo y guárdalo.
  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: org?.name ?? undefined,
      metadata: { organization_id },
    });
    customerId = customer.id;
    const { error } = await admin
      .from("org_subscriptions")
      .upsert({ organization_id, stripe_customer_id: customerId }, { onConflict: "organization_id" });
    if (error) redirect("/facturacion?err=" + encodeURIComponent(error.message));
  }

  // Respeta los días de prueba que le queden, si Stripe lo permite (>48 h).
  const trialEnd = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
  const trialEndUnix = trialEnd > Date.now() + MIN_TRIAL_MS ? Math.floor(trialEnd / 1000) : undefined;

  // Sin payment_method_types: se usan los métodos dinámicos activados en el Dashboard
  // (tarjeta, SEPA, Apple Pay, Google Pay...).
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      metadata: { organization_id },
      ...(trialEndUnix ? { trial_end: trialEndUnix } : {}),
    },
    metadata: { organization_id },
    billing_address_collection: "required",
    customer_update: { address: "auto", name: "auto" },
    tax_id_collection: { enabled: true },
    allow_promotion_codes: true,
    success_url: `${appUrl()}/facturacion?ok=1`,
    cancel_url: `${appUrl()}/facturacion?cancel=1`,
  });

  if (!session.url) redirect("/facturacion?err=" + encodeURIComponent("Stripe no devolvió la URL de pago."));
  redirect(session.url);
}

export async function openBillingPortal() {
  const { organization_id } = await requireOwner();
  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("org_subscriptions")
    .select("stripe_customer_id")
    .eq("organization_id", organization_id)
    .maybeSingle();
  if (!sub?.stripe_customer_id) {
    redirect("/facturacion?err=" + encodeURIComponent("Todavía no tienes datos de facturación."));
  }

  const portal = await getStripe().billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${appUrl()}/facturacion`,
  });
  redirect(portal.url);
}
