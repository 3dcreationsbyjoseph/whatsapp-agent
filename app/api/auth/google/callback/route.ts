import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens } from "@/lib/google/oauth";
import { listCalendars } from "@/lib/google/calendar";
import { encrypt } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("gcal_oauth_state")?.value;
  cookieStore.delete("gcal_oauth_state");

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(
      new URL("/integraciones?err=" + encodeURIComponent("State inválido"), process.env.NEXT_PUBLIC_APP_URL),
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));

  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) {
    return NextResponse.redirect(
      new URL("/integraciones?err=" + encodeURIComponent("Perfil no encontrado"), process.env.NEXT_PUBLIC_APP_URL),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    // Elige el calendario primary por defecto
    const cals = await listCalendars(tokens.refresh_token);
    const primary = cals.find((c) => c.primary) ?? cals[0];
    if (!primary) throw new Error("La cuenta no tiene calendarios disponibles");

    const { error } = await supabase
      .from("google_calendar_configs")
      .upsert(
        {
          organization_id: profile.organization_id,
          calendar_id: primary.id,
          refresh_token_encrypted: encrypt(tokens.refresh_token),
          access_token_encrypted: tokens.access_token ? encrypt(tokens.access_token) : null,
          token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        },
        { onConflict: "organization_id" },
      );
    if (error) throw error;

    return NextResponse.redirect(
      new URL(
        "/integraciones?msg=" + encodeURIComponent(`Conectado. Calendario: ${primary.summary}`),
        process.env.NEXT_PUBLIC_APP_URL,
      ),
    );
  } catch (err) {
    return NextResponse.redirect(
      new URL(
        "/integraciones?err=" + encodeURIComponent((err as Error).message),
        process.env.NEXT_PUBLIC_APP_URL,
      ),
    );
  }
}
