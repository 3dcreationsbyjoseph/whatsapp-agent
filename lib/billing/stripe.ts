// Cliente de Stripe — SOLO servidor. Se instancia de forma perezosa para que
// `next build` no falle si STRIPE_SECRET_KEY no está definida en build.

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Falta STRIPE_SECRET_KEY");
  _stripe = new Stripe(key);
  return _stripe;
}
