// Planes de suscripción y lo que incluye cada uno. Fuente única de verdad:
// el webhook, el agente, las tools y el panel leen de aquí.

import { ANTHROPIC_MODEL, ANTHROPIC_MODEL_ADVANCED } from "@/lib/constants";

export type PlanId = "basic" | "pro" | "max";

export type PlanFeatures = {
  id: PlanId;
  name: string;
  priceEur: number;
  // null = ilimitado
  maxContacts: number | null;
  // Google Calendar (eventos y disponibilidad). Sin él las visitas se reservan
  // solo en la app; el email al cliente sigue funcionando (Gmail).
  calendar: boolean;
  // Códigos ISO permitidos, o "all".
  languages: readonly string[] | "all";
  model: string;
  // Audios de WhatsApp (fase 2: aún no implementado).
  audio: boolean;
};

export const PLANS: Record<PlanId, PlanFeatures> = {
  basic: {
    id: "basic",
    name: "Basic",
    priceEur: 119,
    maxContacts: 15,
    calendar: false,
    languages: ["es", "en", "de"],
    model: ANTHROPIC_MODEL,
    audio: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceEur: 249,
    maxContacts: null,
    calendar: true,
    languages: ["es", "en", "de", "fr", "nl", "it", "sv", "no", "da", "ru"],
    model: ANTHROPIC_MODEL,
    audio: false,
  },
  max: {
    id: "max",
    name: "Max",
    priceEur: 338,
    maxContacts: null,
    calendar: true,
    languages: "all",
    model: ANTHROPIC_MODEL_ADVANCED,
    audio: false,
  },
};

// Durante la prueba gratuita (sin suscripción en Stripe) se prueba todo Max.
export const TRIAL_PLAN: PlanId = "max";

export const LANGUAGE_NAMES: Record<string, string> = {
  es: "español",
  en: "inglés",
  de: "alemán",
  fr: "francés",
  nl: "neerlandés",
  it: "italiano",
  sv: "sueco",
  no: "noruego",
  da: "danés",
  ru: "ruso",
};

export function isPlanId(v: unknown): v is PlanId {
  return v === "basic" || v === "pro" || v === "max";
}

// Precio de Stripe de cada plan (variables de entorno).
export function stripePriceId(plan: PlanId): string | undefined {
  return {
    basic: process.env.STRIPE_PRICE_BASIC,
    pro: process.env.STRIPE_PRICE_PRO,
    max: process.env.STRIPE_PRICE_MAX,
  }[plan];
}

export function planFromStripePrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const plan of ["basic", "pro", "max"] as const) {
    if (stripePriceId(plan) === priceId) return plan;
  }
  return null;
}

// Código de idioma permitido por el plan; si no lo está, inglés.
export function allowedLanguage(code: string, plan: PlanFeatures): string {
  if (plan.languages === "all") return code;
  const base = code.toLowerCase().split("-")[0];
  return plan.languages.includes(base) ? code : "en";
}
