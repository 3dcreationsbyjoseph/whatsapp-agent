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
  SignOutIcon,
} from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, organizations(name)")
    .eq("id", user.id)
    .single();

  const org = (profile?.organizations as { name: string } | { name: string }[] | null) ?? null;
  const orgName = Array.isArray(org) ? org[0]?.name : org?.name;

  const links = [
    { href: "/dashboard", label: "Panel", icon: ChartLineIcon },
    { href: "/propiedades", label: "Propiedades", icon: BuildingApartmentIcon },
    { href: "/visitas", label: "Visitas", icon: CalendarCheckIcon },
    { href: "/leads", label: "Clientes", icon: UsersFourIcon },
    { href: "/conversaciones", label: "Conversaciones", icon: ChatCircleIcon },
    { href: "/personalizacion", label: "Personalización", icon: SlidersHorizontalIcon },
    { href: "/integraciones", label: "Integraciones", icon: PlugIcon },
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
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white transition"
            >
              <Icon size={18} weight="regular" />
              {label}
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
      <main className="flex-1 p-10 overflow-x-hidden">{children}</main>
    </div>
  );
}
