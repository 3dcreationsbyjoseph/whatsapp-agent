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

  // El verify_token en BD es la cadena completa (formato "{org_slug}:{secret}"),
  // y el multi-tenancy sale automáticamente de que la cadena entera sea única.
  const admin = createAdminClient();
  const { data: cfg } = await admin
    .from("whatsapp_configs")
    .select("organization_id")
    .eq("verify_token", token)
    .maybeSingle();
  if (!cfg) return new Response("Forbidden", { status: 403 });

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

  // Todos los phone_number_id del payload (no solo el primero): processWebhook
  // procesa cada entry/change, así que la firma debe valer para TODAS las orgs
  // implicadas. Si no, una org podría firmar con su secret y colar mensajes de otra.
  const phoneNumberIds = new Set<string>();
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const id = change?.value?.metadata?.phone_number_id;
      if (typeof id === "string" && id) phoneNumberIds.add(id);
    }
  }
  if (phoneNumberIds.size === 0) {
    // Meta también manda eventos de estado sin messages — ack 200 y salir.
    return new Response("OK", { status: 200 });
  }

  const admin = createAdminClient();
  const { data: configs } = await admin
    .from("whatsapp_configs")
    .select("app_secret_encrypted, organization_id, phone_number_id")
    .in("phone_number_id", [...phoneNumberIds]);

  if (!configs || configs.length === 0) {
    console.warn(
      JSON.stringify({ level: "warn", msg: "phone_number_id no registrado", phoneNumberIds: [...phoneNumberIds] }),
    );
    // 200 igualmente para que Meta no reintente indefinidamente.
    return new Response("OK", { status: 200 });
  }

  // Los no registrados los ignora processWebhook; los registrados deben validar la firma.
  for (const wa of configs) {
    const appSecret = decrypt(wa.app_secret_encrypted);
    if (!verifyMetaSignature(raw, signature, appSecret)) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "firma inválida",
          phoneNumberId: wa.phone_number_id,
          organization_id: wa.organization_id,
        }),
      );
      return new Response("Forbidden", { status: 403 });
    }
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
