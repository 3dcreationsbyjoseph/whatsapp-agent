import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { upsertProperty, deleteProperty } from "../actions";

export default async function PropertyEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "nueva";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) return null;

  const property = isNew
    ? null
    : (await supabase
        .from("properties")
        .select("*")
        .eq("id", id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle()).data;

  if (!isNew && !property) return notFound();

  const featuresArr = Array.isArray(property?.features) ? (property!.features as string[]) : [];
  const photosArr = Array.isArray(property?.photo_urls) ? (property!.photo_urls as string[]) : [];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {isNew ? "Añadir propiedad" : property?.title}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          {isNew ? "Crea una ficha para que el asistente pueda ofrecerla." : "Edita la ficha o cambia el estado."}
        </p>
      </div>

      {sp.msg ? <p className="text-sm text-emerald-400">{sp.msg}</p> : null}
      {sp.err ? <p className="text-sm text-red-400">{sp.err}</p> : null}

      <form action={upsertProperty} className="space-y-6">
        {!isNew ? <input type="hidden" name="id" value={id} /> : null}

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field name="title" label="Título" defaultValue={property?.title ?? ""} required className="sm:col-span-2" />
          <Field name="reference" label="Referencia interna" defaultValue={property?.reference ?? ""} />
          <Select
            name="property_type"
            label="Tipo"
            defaultValue={(property?.property_type as string | undefined) ?? "villa"}
            options={["villa", "chalet", "apartamento", "ático", "casa rural", "adosado", "finca"]}
          />
          <Select
            name="location"
            label="Ubicación"
            defaultValue={(property?.location as string | undefined) ?? "Jávea"}
            options={["Jávea", "Moraira", "Denia", "Calpe", "Altea", "Benissa", "Teulada", "Benitachell", "Pedreguer", "Otro"]}
          />
          <Field name="price_eur" label="Precio (€)" type="number" defaultValue={property?.price_eur?.toString() ?? ""} required />
          <Field name="bedrooms" label="Dormitorios" type="number" defaultValue={property?.bedrooms?.toString() ?? "0"} />
          <Field name="bathrooms" label="Baños" type="number" defaultValue={property?.bathrooms?.toString() ?? "0"} />
          <Field name="built_area_m2" label="m² construidos" type="number" defaultValue={property?.built_area_m2?.toString() ?? ""} />
          <Field name="plot_area_m2" label="m² parcela" type="number" defaultValue={property?.plot_area_m2?.toString() ?? ""} />
          <Select
            name="status"
            label="Estado"
            defaultValue={(property?.status as string | undefined) ?? "available"}
            options={["available", "reserved", "sold", "off_market"]}
          />
        </section>

        <section className="space-y-4">
          <TextArea
            name="features"
            label="Características (una por línea o separadas por comas)"
            rows={4}
            defaultValue={featuresArr.join("\n")}
            placeholder="Piscina climatizada\nVistas al mar\nDomótica\nGaraje 3 coches"
          />
          <TextArea
            name="description"
            label="Descripción"
            rows={6}
            defaultValue={property?.description ?? ""}
            placeholder="Descripción detallada de la propiedad, ubicación, estilo arquitectónico, terminaciones..."
          />
          <TextArea
            name="photo_urls"
            label="URLs de fotos (una por línea, en el orden que quieres que se envíen)"
            rows={6}
            defaultValue={photosArr.join("\n")}
            placeholder="https://cdn.tudominio.com/villa-01.jpg\nhttps://cdn.tudominio.com/villa-02.jpg"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field name="video_url" label="URL del vídeo (opcional)" defaultValue={property?.video_url ?? ""} />
            <Field name="virtual_tour_url" label="URL del tour virtual (opcional)" defaultValue={property?.virtual_tour_url ?? ""} />
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field name="agent_name" label="Agente asignado (opcional)" defaultValue={property?.agent_name ?? ""} />
          <Field name="agent_phone" label="Teléfono del agente (opcional)" defaultValue={property?.agent_phone ?? ""} />
        </section>

        <div className="flex justify-between items-center pt-4 border-t border-neutral-900">
          <button
            type="submit"
            className="rounded-lg bg-white text-black font-medium px-5 py-2.5 text-sm hover:bg-neutral-200 transition"
          >
            {isNew ? "Crear propiedad" : "Guardar cambios"}
          </button>
          {!isNew ? (
            <form action={deleteProperty.bind(null, id)}>
              <button
                type="submit"
                className="text-sm text-red-400 hover:text-red-300 transition"
              >
                Eliminar propiedad
              </button>
            </form>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  required,
  className,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | null;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className ?? ""}`}>
      <span className="mb-1.5 block text-neutral-400">{label}{required ? " *" : ""}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
      />
    </label>
  );
}

function Select({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: string[];
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-neutral-400">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function TextArea({
  name,
  label,
  rows,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  rows: number;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-neutral-400">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-white/30"
      />
    </label>
  );
}
