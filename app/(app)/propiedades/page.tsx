import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr";

export default async function PropiedadesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) return null;

  const { data: properties } = await supabase
    .from("properties")
    .select("id, reference, title, location, property_type, price_eur, bedrooms, bathrooms, built_area_m2, status, photo_urls")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false });

  const fmt = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Propiedades</h1>
          <p className="text-sm text-neutral-500 mt-1">Catálogo del que el asistente virtual selecciona para tus clientes.</p>
        </div>
        <Link href="/propiedades/nueva" className="inline-flex items-center gap-2 rounded-lg bg-white text-black font-medium px-4 py-2 text-sm hover:bg-neutral-200 transition">
          <PlusIcon size={16} weight="bold" /> Añadir propiedad
        </Link>
      </div>

      {params.msg ? <p className="text-sm text-emerald-400">{params.msg}</p> : null}
      {params.err ? <p className="text-sm text-red-400">{params.err}</p> : null}

      {(properties ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center">
          <p className="text-neutral-400">Aún no has añadido ninguna propiedad.</p>
          <p className="text-neutral-500 text-sm mt-1">Añade la primera para que el asistente pueda ofrecerla a tus clientes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {(properties ?? []).map((p) => {
            const photos = Array.isArray(p.photo_urls) ? (p.photo_urls as string[]) : [];
            return (
              <Link
                key={p.id}
                href={`/propiedades/${p.id}`}
                className="group rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 hover:border-neutral-700 transition"
              >
                <div className="aspect-[16/10] bg-neutral-800 overflow-hidden">
                  {photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photos[0]} alt={p.title} className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-500 text-xs">Sin fotos</div>
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium leading-tight line-clamp-2">{p.title}</h3>
                    {p.status !== "available" ? (
                      <span className="shrink-0 rounded-full text-[10px] uppercase tracking-wide bg-neutral-800 border border-neutral-700 px-2 py-0.5 text-neutral-400">
                        {p.status}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-neutral-500 uppercase tracking-wide">
                    {p.property_type} · {p.location}{p.reference ? ` · ${p.reference}` : ""}
                  </div>
                  <div className="text-lg font-semibold text-white">{fmt(Number(p.price_eur))}</div>
                  <div className="text-xs text-neutral-400">
                    {p.bedrooms} dorm · {p.bathrooms} baños{p.built_area_m2 ? ` · ${p.built_area_m2} m²` : ""}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
