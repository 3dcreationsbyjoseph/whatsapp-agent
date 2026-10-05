"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateEventStatus, type GCalConfig } from "@/lib/google/calendar";
import { notifyClientByEmail } from "@/lib/email/notify";
import { DEFAULT_TIMEZONE, formatInTz } from "@/lib/format-date";

type Appt = {
  id: string;
  contact_id: string;
  starts_at: string;
  status: string;
  google_event_id: string | null;
  property: { title: string } | { title: string }[] | null;
};

// Carga la cita (acotada a la organización del usuario) y la config de Google.
async function loadAppointment(appointment_id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single<{ organization_id: string }>();
  if (!profile) throw new Error("Perfil no encontrado");
  const organization_id = profile.organization_id;

  const { data: appt } = await supabase
    .from("appointments")
    .select("id, contact_id, starts_at, status, google_event_id, property:properties(title)")
    .eq("id", appointment_id)
    .eq("organization_id", organization_id)
    .maybeSingle<Appt>();
  if (!appt) throw new Error("Visita no encontrada");

  // Tokens cifrados: solo en servidor, con el cliente admin.
  const admin = createAdminClient();
  const [{ data: gcal }, { data: org }] = await Promise.all([
    admin
      .from("google_calendar_configs")
      .select("organization_id, calendar_id, refresh_token_encrypted, access_token_encrypted, token_expires_at")
      .eq("organization_id", organization_id)
      .maybeSingle<GCalConfig>(),
    admin.from("organizations").select("timezone").eq("id", organization_id).maybeSingle<{ timezone: string }>(),
  ]);
  return { supabase, admin, organization_id, appt, gcal: gcal ?? null, tz: org?.timezone ?? DEFAULT_TIMEZONE };
}

// Borra el evento de Google si existe. Un fallo de Google no bloquea la gestión.
async function removeGoogleEvent(gcal: GCalConfig | null, eventId: string | null): Promise<boolean> {
  if (!gcal || !eventId) return true;
  try {
    await updateEventStatus(gcal, eventId, "cancelled");
    return true;
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", msg: "google event delete failed", err: (err as Error).message }));
    return false;
  }
}

function revalidateAll() {
  revalidatePath("/visitas");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

export async function cancelVisit(appointment_id: string) {
  const { admin, organization_id, appt, gcal, tz } = await loadAppointment(appointment_id);
  if (appt.status === "cancelled") return;

  await removeGoogleEvent(gcal, appt.google_event_id);
  const { error } = await admin
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appt.id)
    .eq("organization_id", organization_id);
  if (error) throw new Error(error.message);

  // Aviso por email al cliente (si dio su email) y constancia en su conversación.
  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("organization_id", organization_id)
    .eq("contact_id", appt.contact_id)
    .maybeSingle<{ id: string }>();
  if (conv) {
    const property = Array.isArray(appt.property) ? appt.property[0] : appt.property;
    await notifyClientByEmail({
      organization_id,
      contact_id: appt.contact_id,
      conversation_id: conv.id,
      gcal,
      email: { kind: "visit_cancelled", when: formatInTz(appt.starts_at, tz, "long"), property: property?.title ?? null },
    });
  }
  revalidateAll();
}

export async function completeVisit(appointment_id: string) {
  const { admin, organization_id, appt } = await loadAppointment(appointment_id);
  const { error } = await admin
    .from("appointments")
    .update({ status: "completed" })
    .eq("id", appt.id)
    .eq("organization_id", organization_id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Elimina la visita de la app y su evento de Google Calendar (sin avisar al cliente).
export async function deleteVisit(appointment_id: string) {
  const { admin, organization_id, appt, gcal } = await loadAppointment(appointment_id);
  if (appt.status !== "cancelled") await removeGoogleEvent(gcal, appt.google_event_id);
  const { error } = await admin.from("appointments").delete().eq("id", appt.id).eq("organization_id", organization_id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
