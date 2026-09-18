"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { testWhatsAppCredentials } from "@/lib/whatsapp/send";

async function currentOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  return p?.organization_id ?? null;
}

export async function saveWhatsAppConfig(formData: FormData) {
  const orgId = await currentOrgId();
  if (!orgId) redirect("/login");

  const supabase = await createClient();
  const phone_number_id = String(formData.get("phone_number_id") ?? "").trim();
  const waba_id = String(formData.get("waba_id") ?? "").trim();
  const access_token = String(formData.get("access_token") ?? "").trim();
  const verify_token = String(formData.get("verify_token") ?? "").trim();
  const app_secret = String(formData.get("app_secret") ?? "").trim();

  if (!phone_number_id || !waba_id || !verify_token) {
    redirect("/integraciones?err=" + encodeURIComponent("Faltan campos obligatorios"));
  }

  const patch: Record<string, string> = {
    organization_id: orgId!,
    phone_number_id,
    waba_id,
    verify_token,
  };
  if (access_token) patch.access_token_encrypted = encrypt(access_token);
  if (app_secret) patch.app_secret_encrypted = encrypt(app_secret);

  // Verifica que si es una inserción nueva, se hayan enviado los cifrados.
  const { data: existing } = await supabase
    .from("whatsapp_configs")
    .select("organization_id")
    .eq("organization_id", orgId!)
    .maybeSingle();

  if (!existing && (!access_token || !app_secret)) {
    redirect("/integraciones?err=" + encodeURIComponent("Access Token y App Secret son obligatorios en la primera configuración"));
  }

  const { error } = await supabase
    .from("whatsapp_configs")
    .upsert(patch as never, { onConflict: "organization_id" });

  if (error) {
    redirect("/integraciones?err=" + encodeURIComponent(error.message));
  }
  revalidatePath("/integraciones");
  redirect("/integraciones?msg=" + encodeURIComponent("Configuración guardada"));
}

export async function testWhatsApp(formData: FormData) {
  const phone_number_id = String(formData.get("phone_number_id") ?? "").trim();
  const access_token = String(formData.get("access_token") ?? "").trim();
  if (!phone_number_id || !access_token) {
    redirect("/integraciones?err=" + encodeURIComponent("Escribe phone_number_id y access_token para probar"));
  }
  const res = await testWhatsAppCredentials(phone_number_id, access_token);
  if (!res.ok) {
    redirect("/integraciones?err=" + encodeURIComponent(res.error ?? "Error desconocido"));
  }
  redirect(
    "/integraciones?msg=" +
      encodeURIComponent(`Conectado a ${res.display_phone_number ?? phone_number_id}`),
  );
}
