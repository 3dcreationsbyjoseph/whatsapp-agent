"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const full_name = String(formData.get("full_name") ?? "");
  const organization_name = String(formData.get("organization_name") ?? "");

  const supabase = await createClient();

  // Los metadatos van a raw_user_meta_data → el trigger handle_new_user()
  // crea la organization y el profile automáticamente.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, organization_name },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/signup?message=Revisa%20tu%20correo%20para%20confirmar%20la%20cuenta.");
}
