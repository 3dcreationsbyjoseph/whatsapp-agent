import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChartLineIcon,
  BuildingApartmentIcon,
  CalendarCheckIcon,
  ChatCircleIcon,
  UsersFourIcon,
  SlidersHorizontalIcon,
  PlugIcon,
  CreditCardIcon,
  HeadsetIcon,
  SignOutIcon,
} from "@phosphor-icons/react/dist/ssr";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getOrgBilling } from "@/lib/billing/access";
import { logout } from "@/app/(auth)/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, organization_id, organizations(name)")
    .eq("id", user.id)
    .single<{
      full_name: string | null;
      organization_id: string;
      organizations: { name: string } | { name: string }[] | null;
    }>();

  // Sin prueba vigente ni suscripción: solo se puede entrar en /facturacion.
  // El middleware pasa la ruta actual en x-pathname.
  const billing = profile ? await getOrgBilling(profile.organization_id) : null;
  const pathname = (await headers()).get("x-pathname") ?? "";
  const onBillingPage = pathname === "/facturacion" || pathname.startsWith("/facturacion/");
  if (billing && !billing.hasAccess && !onBillingPage) redirect("/facturacion?expired=1");

  // Clientes esperando a una persona (bot pausado) → contador en el menú.
  const { count: pendingHumans } = profile
    ? await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", profile.organization_id)
        .eq("bot_active", false)
    : { count: 0 };

  const org = (profile?.organizations as { name: string } | { name: string }[] | null) ?? null;
  const orgName = Array.isArray(org) ? org[0]?.name : org?.name;

  const links: Array<{ href: string; label: string; icon: typeof ChartLineIcon; badge?: number }> = [
    { href: "/dashboard", label: "Panel", icon: ChartLineIcon },
    { href: "/propiedades", label: "Propiedades", icon: BuildingApartmentIcon },
    { href: "/visitas", label: "Visitas", icon: CalendarCheckIcon },
    { href: "/leads", label: "Clientes", icon: UsersFourIcon },
    { href: "/conversaciones", label: "Conversaciones", icon: ChatCircleIcon },
    { href: "/atencion", label: "Atención humana", icon: HeadsetIcon, badge: pendingHumans ?? 0 },
    { href: "/personalizacion", label: "Personalización", icon: SlidersHorizontalIcon },
    { href: "/integraciones", label: "Integraciones", icon: PlugIcon },
    { href: "/facturacion", label: "Facturación", icon: CreditCardIcon },
  ];

  return (
    <div className="min-h-screen flex bg-neutral-950">
      <aside className="w-64 shrink-0 border-r border-neutral-900 bg-black p-5 flex flex-col">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-neutral-500">Agencia</div>
          <div className="mt-1 text-base font-semibold text-white truncate">
            {orgName ?? "—"}
          </div>
        </div>
        <nav className="flex-1 space-y-0.5">
          {links.map(({ href, label, icon: Icon, badge }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white transition"
            >
              <Icon size={18} weight="regular" />
              <span className="flex-1">{label}</span>
              {badge ? (
                <span className="rounded-full bg-yellow-500 px-1.5 text-[11px] font-semibold text-black">{badge}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <form action={logout} className="pt-4 mt-4 border-t border-neutral-900">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-900 hover:text-white transition"
          >
            <SignOutIcon size={18} />
            Cerrar sesión
          </button>
        </form>
      </aside>
      <main className="flex-1 p-10 overflow-x-hidden">
        {billing && billing.status === "trialing" && billing.hasAccess ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm text-neutral-300">
            <span>
              Te {billing.daysLeft === 1 ? "queda 1 día" : `quedan ${billing.daysLeft} días`} de prueba.
            </span>
            <Link href="/facturacion" className="text-white underline underline-offset-4 hover:text-neutral-300">
              Activar suscripción
            </Link>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
