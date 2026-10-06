// Callback de Supabase Auth: intercambia el ?code (o ?token_hash) por sesión.

import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();

  // Formato token_hash (plantilla de email con {{ .TokenHash }}): no depende
  // de cookies, funciona aunque el enlace se abra en otro navegador/dispositivo.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error(JSON.stringify({ level: "error", msg: "auth verifyOtp failed", err: error.message }));
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("El enlace no es válido o ha caducado. Inicia sesión o regístrate de nuevo.")}`,
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    // Con ?code Supabase YA ha confirmado el email; lo que falla es crear la
    // sesión (PKCE: falta la cookie si el enlace se abre en otro navegador).
    console.error(JSON.stringify({ level: "error", msg: "auth exchangeCodeForSession failed", err: error.message }));
    return NextResponse.redirect(
      `${origin}/login?message=${encodeURIComponent("Email confirmado. Inicia sesión para entrar.")}`,
    );
  }

  // Supabase redirige con ?error_description si el enlace falló en su lado.
  const description = searchParams.get("error_description");
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(description ?? "No se pudo completar el inicio de sesión")}`,
  );
}
