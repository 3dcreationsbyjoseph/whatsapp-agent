// Webhook de WhatsApp Cloud API.
// - GET: verificación con hub.verify_token — busca la org por phone_number_id
//   pasado como parámetro `hub.verify_token` con formato "{org_slug}:{token}".
// - POST: verifica firma HMAC-SHA256 y procesa en background con after().

import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import { processWebhook } from "@/lib/webhook-processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new Response("Bad Request", { status: 400 });
  }

  // Formato del verify_token: "{org_slug}:{secret}"
  const [slug, secret] = token.split(":");
  if (!slug || !secret) return new Response("Forbidden", { status: 403 });

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!org) return new Response("Forbidden", { status: 403 });

  const { data: cfg } = await admin
    .from("whatsapp_configs")
    .select("verify_token")
    .eq("organization_id", org.id)
    .single();
  if (!cfg || cfg.verify_token !== secret) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge, { status: 200 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  // Necesitamos resolver la org desde el payload para obtener su app_secret.
  // Meta manda el phone_number_id en value.metadata.phone_number_id.
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const phoneNumberId: string | undefined =
    payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
  if (!phoneNumberId) {
    // Meta también manda eventos de estado sin messages — ack 200 y salir.
    return new Response("OK", { status: 200 });
  }

  const admin = createAdminClient();
  const { data: wa } = await admin
    .from("whatsapp_configs")
    .select("app_secret_encrypted, organization_id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (!wa) {
    console.warn(JSON.stringify({ level: "warn", msg: "phone_number_id no registrado", phoneNumberId }));
    // 200 igualmente para que Meta no reintente indefinidamente.
    return new Response("OK", { status: 200 });
  }

  const appSecret = decrypt(wa.app_secret_encrypted);
  const valid = verifyMetaSignature(raw, signature, appSecret);
  if (!valid) {
    console.error(JSON.stringify({ level: "error", msg: "firma inválida", phoneNumberId }));
    return new Response("Forbidden", { status: 403 });
  }

  // Procesa en background: Meta reintenta hasta 7 días si tardas.
  after(async () => {
    try {
      await processWebhook(payload);
    } catch (err) {
      console.error(JSON.stringify({ level: "error", msg: "processWebhook falló", err: (err as Error).message }));
    }
  });

  return new Response("OK", { status: 200 });
}
