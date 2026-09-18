import { createClient } from "@/lib/supabase/server";
import { savePersonalization } from "./actions";

export default async function PersonalizacionPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) return null;

  const { data: cfg } = await supabase
    .from("agent_configs")
    .select("system_prompt, tone, business_info, services, business_hours, handoff_message")
    .eq("organization_id", profile.organization_id)
    .single();

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Personalización del agente</h1>
      {params.msg ? <p className="text-sm text-emerald-400">{params.msg}</p> : null}
      {params.err ? <p className="text-sm text-red-400">{params.err}</p> : null}

      <form action={savePersonalization} className="space-y-4">
        <Field name="tone" label="Tono de voz" defaultValue={cfg?.tone ?? ""} />
        <TextArea
          name="system_prompt"
          label="System prompt"
          rows={10}
          defaultValue={cfg?.system_prompt ?? ""}
        />
        <TextArea
          name="business_info"
          label="Información del negocio (JSON)"
          rows={6}
          defaultValue={JSON.stringify(cfg?.business_info ?? {}, null, 2)}
        />
        <TextArea
          name="services"
          label="Servicios (JSON array)"
          rows={6}
          defaultValue={JSON.stringify(cfg?.services ?? [], null, 2)}
        />
        <TextArea
          name="business_hours"
          label="Horarios de atención (JSON)"
          rows={8}
          defaultValue={JSON.stringify(cfg?.business_hours ?? {}, null, 2)}
        />
        <Field
          name="handoff_message"
          label="Mensaje de handoff"
          defaultValue={cfg?.handoff_message ?? ""}
        />
        <button
          type="submit"
          className="rounded-lg bg-white text-black font-medium px-4 py-2 text-sm hover:bg-neutral-200 transition"
        >
          Guardar cambios
        </button>
      </form>
    </div>
  );
}

function Field({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-400">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
      />
    </label>
  );
}

function TextArea({
  name,
  label,
  defaultValue,
  rows,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  rows: number;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-400">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-white/40"
      />
    </label>
  );
}
