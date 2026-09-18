"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function savePersonalization(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user!.id).single();
  if (!profile) redirect("/login");

  const tone = String(formData.get("tone") ?? "").trim();
  const system_prompt = String(formData.get("system_prompt") ?? "").trim();
  const handoff_message = String(formData.get("handoff_message") ?? "").trim() || null;

  let business_info: unknown = {};
  let services: unknown = [];
  let business_hours: unknown = {};
  try {
    business_info = JSON.parse(String(formData.get("business_info") ?? "{}"));
    services = JSON.parse(String(formData.get("services") ?? "[]"));
    business_hours = JSON.parse(String(formData.get("business_hours") ?? "{}"));
  } catch (err) {
    redirect("/personalizacion?err=" + encodeURIComponent("JSON inválido: " + (err as Error).message));
  }

  const { error } = await supabase
    .from("agent_configs")
    .update({
      tone,
      system_prompt,
      handoff_message,
      business_info: business_info as never,
      services: services as never,
      business_hours: business_hours as never,
    })
    .eq("organization_id", profile!.organization_id);

  if (error) {
    redirect("/personalizacion?err=" + encodeURIComponent(error.message));
  }
  revalidatePath("/personalizacion");
  redirect("/personalizacion?msg=" + encodeURIComponent("Guardado"));
}
