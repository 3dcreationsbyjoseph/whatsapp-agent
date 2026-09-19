"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function parseCsv(input: string): string[] {
  return input
    .split(/\r?\n|,|;/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Normaliza URLs de imagen para que WhatsApp pueda descargarlas.
// Corrige los formatos más comunes que los usuarios pegan por error.
function normalizePhotoUrl(raw: string): string {
  const url = raw.trim();
  // Imgur: página → i.imgur.com/xxx.jpg
  const imgurMatch = url.match(/^https?:\/\/(?:www\.)?imgur\.com\/(?:gallery\/|a\/)?([A-Za-z0-9]{5,15})(?:\.(?:jpg|jpeg|png|webp|gif))?(?:\?.*)?$/i);
  if (imgurMatch) return `https://i.imgur.com/${imgurMatch[1]}.jpg`;
  // Dropbox: ?dl=0 → ?raw=1
  if (url.includes("dropbox.com") && !url.includes("raw=1")) {
    return url.replace(/[?&]dl=0/, "").replace(/$/, url.includes("?") ? "&raw=1" : "?raw=1");
  }
  // Google Drive: /file/d/{id}/view → /uc?export=view&id={id}
  const gdrive = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdrive) return `https://drive.google.com/uc?export=view&id=${gdrive[1]}`;
  return url;
}

function parsePhotoUrls(input: string): string[] {
  return parseCsv(input).map(normalizePhotoUrl);
}

function parseInt2(input: FormDataEntryValue | null): number | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

export async function upsertProperty(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");

  const id = String(formData.get("id") ?? "").trim();
  const patch = {
    organization_id: profile.organization_id,
    reference: String(formData.get("reference") ?? "").trim() || null,
    title: String(formData.get("title") ?? "").trim(),
    location: String(formData.get("location") ?? "").trim(),
    property_type: String(formData.get("property_type") ?? "villa").trim(),
    price_eur: parseInt2(formData.get("price_eur")) ?? 0,
    bedrooms: parseInt2(formData.get("bedrooms")) ?? 0,
    bathrooms: parseInt2(formData.get("bathrooms")) ?? 0,
    built_area_m2: parseInt2(formData.get("built_area_m2")),
    plot_area_m2: parseInt2(formData.get("plot_area_m2")),
    features: parseCsv(String(formData.get("features") ?? "")) as unknown as never,
    description: String(formData.get("description") ?? "").trim() || null,
    photo_urls: parsePhotoUrls(String(formData.get("photo_urls") ?? "")) as unknown as never,
    video_url: String(formData.get("video_url") ?? "").trim() || null,
    virtual_tour_url: String(formData.get("virtual_tour_url") ?? "").trim() || null,
    status: String(formData.get("status") ?? "available").trim(),
    agent_name: String(formData.get("agent_name") ?? "").trim() || null,
    agent_phone: String(formData.get("agent_phone") ?? "").trim() || null,
  };

  if (!patch.title || !patch.location || patch.price_eur <= 0) {
    redirect(`/propiedades/${id || "nueva"}?err=` + encodeURIComponent("Título, ubicación y precio son obligatorios"));
  }

  if (id) {
    const { error } = await supabase.from("properties").update(patch as never).eq("id", id);
    if (error) redirect(`/propiedades/${id}?err=` + encodeURIComponent(error.message));
    revalidatePath("/propiedades");
    redirect(`/propiedades/${id}?msg=` + encodeURIComponent("Cambios guardados"));
  } else {
    const { data, error } = await supabase.from("properties").insert(patch as never).select("id").single();
    if (error) redirect(`/propiedades/nueva?err=` + encodeURIComponent(error.message));
    revalidatePath("/propiedades");
    redirect(`/propiedades/${data.id}?msg=` + encodeURIComponent("Propiedad creada"));
  }
}

export async function deleteProperty(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("properties").delete().eq("id", id);
  if (error) redirect(`/propiedades/${id}?err=` + encodeURIComponent(error.message));
  revalidatePath("/propiedades");
  redirect("/propiedades?msg=" + encodeURIComponent("Propiedad eliminada"));
}
