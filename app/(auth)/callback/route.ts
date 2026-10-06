// Callback de Supabase Auth: intercambia el ?code por sesión.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  // Solo PKCE (?code): el canje exige la cookie code_verifier del navegador que
  // hizo el registro. No aceptamos ?token_hash por GET: permitiría login CSRF
  // (un atacante enviaría su propio enlace y la víctima entraría en su cuenta).
  if (code) {
    const supabase = await createClient();
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
