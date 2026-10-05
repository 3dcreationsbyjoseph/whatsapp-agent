// Webhook de Stripe.
// - Verifica la firma (Stripe-Signature) sobre el raw body con STRIPE_WEBHOOK_SECRET.
// - Sincroniza org_subscriptions con el service role (sin sesión de usuario).
// - Responde 200 a los tipos de evento que no manejamos.

import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { syncSubscription } from "@/lib/billing/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function subscriptionIdOf(ref: string | Stripe.Subscription | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("missing signature", { status: 400 });

  const raw = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", msg: "stripe bad signature", err: (err as Error).message }));
    return new Response("bad signature", { status: 400 });
  }

  const start = Date.now();
  try {
    let subId: string | null = null;
    switch (event.type) {
      case "checkout.session.completed":
        subId = subscriptionIdOf(event.data.object.subscription);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        subId = event.data.object.id;
        break;
      case "invoice.payment_failed":
        subId = subscriptionIdOf(event.data.object.parent?.subscription_details?.subscription);
        break;
      default:
        return Response.json({ received: true, handled: false });
    }

    let organization_id: string | null = null;
    if (subId) {
      // Releemos la suscripción para trabajar siempre con el estado más reciente.
      const sub = await stripe.subscriptions.retrieve(subId);
      ({ organization_id } = await syncSubscription(sub));
    }

    console.log(
      JSON.stringify({
        level: "info",
        msg: "stripe event processed",
        event_id: event.id,
        type: event.type,
        organization_id,
        latency_ms: Date.now() - start,
      }),
    );
    return Response.json({ received: true });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "stripe event failed",
        event_id: event.id,
        type: event.type,
        err: (err as Error).message,
      }),
    );
    // 500 → Stripe reintenta.
    return new Response("error", { status: 500 });
  }
}
