import { createClient } from "@/lib/supabase/server";
import { saveWhatsAppConfig, testWhatsApp } from "./actions";
import Link from "next/link";

export default async function IntegracionesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) return null;

  const [{ data: wa }, { data: gcal }, { data: org }] = await Promise.all([
    supabase
      .from("whatsapp_configs")
      .select("phone_number_id, waba_id, verify_token")
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
    supabase
      .from("google_calendar_configs")
      .select("calendar_id, token_expires_at")
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
    supabase.from("organizations").select("slug").eq("id", profile.organization_id).single(),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/webhooks/whatsapp`;
  const verifyTokenHint = org?.slug ? `${org.slug}:tu-secreto-aqui` : "tu-org:tu-secreto";

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">Integraciones</h1>

      {params.msg ? <p className="text-sm text-emerald-400">{params.msg}</p> : null}
      {params.err ? <p className="text-sm text-red-400">{params.err}</p> : null}

      {/* WhatsApp */}
      <section className="rounded-xl border border-neutral-800 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-medium">WhatsApp Cloud API</h2>
          <p className="text-sm text-neutral-400">
            Configura las credenciales de tu app de Meta (WhatsApp Business Platform).
          </p>
        </div>

        <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-xs text-neutral-400 space-y-1">
          <div>
            <span className="text-neutral-500">Webhook URL:</span>{" "}
            <code className="text-white">{webhookUrl}</code>
          </div>
          <div>
            <span className="text-neutral-500">Formato del Verify token:</span>{" "}
            <code className="text-white">{verifyTokenHint}</code>
          </div>
        </div>

        <form action={saveWhatsAppConfig} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field name="phone_number_id" label="Phone Number ID" defaultValue={wa?.phone_number_id} />
          <Field name="waba_id" label="WhatsApp Business Account ID" defaultValue={wa?.waba_id} />
          <Field name="access_token" label="Access Token (System User)" type="password" />
          <Field name="verify_token" label="Verify Token" defaultValue={wa?.verify_token} />
          <Field name="app_secret" label="App Secret" type="password" className="sm:col-span-2" />
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-white text-black font-medium px-4 py-2 text-sm hover:bg-neutral-200 transition"
            >
              Guardar
            </button>
            <button
              type="submit"
              formAction={testWhatsApp}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900 transition"
            >
              Probar conexión
            </button>
          </div>
        </form>
      </section>

      {/* Google Calendar */}
      <section className="rounded-xl border border-neutral-800 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-medium">Google Calendar</h2>
          <p className="text-sm text-neutral-400">
            Conecta tu cuenta de Google para que el agente lea huecos libres y agende citas.
          </p>
        </div>
        {gcal ? (
          <div className="text-sm text-emerald-400">
            Conectado. Calendario: <code className="text-white">{gcal.calendar_id}</code>
          </div>
        ) : (
          <div className="text-sm text-neutral-400">Aún no conectado.</div>
        )}
        <Link
          href="/api/auth/google/start"
          className="inline-block rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900 transition"
        >
          {gcal ? "Reconectar" : "Conectar con Google"}
        </Link>
      </section>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  className,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | null;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className ?? ""}`}>
      <span className="mb-1 block text-neutral-400">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
      />
    </label>
  );
}
