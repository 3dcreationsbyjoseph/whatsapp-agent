import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChartLineIcon,
  CalendarIcon,
  ChatCircleIcon,
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
    { href: "/dashboard", label: "Dashboard", icon: ChartLineIcon },
    { href: "/citas", label: "Citas", icon: CalendarIcon },
    { href: "/conversaciones", label: "Conversaciones", icon: ChatCircleIcon },
    { href: "/personalizacion", label: "Personalización", icon: SlidersHorizontalIcon },
    { href: "/integraciones", label: "Integraciones", icon: PlugIcon },
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-neutral-800 bg-neutral-950 p-4 flex flex-col">
        <div className="mb-6">
          <div className="text-lg font-semibold">WhatsApp Agent</div>
          {orgName ? <div className="text-xs text-neutral-500 truncate">{orgName}</div> : null}
        </div>
        <nav className="flex-1 space-y-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white transition"
            >
              <Icon size={18} weight="regular" />
              {label}
            </Link>
          ))}
        </nav>
        <form action={logout} className="pt-4 border-t border-neutral-800">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-white transition"
          >
            <SignOutIcon size={18} />
            Cerrar sesión
          </button>
        </form>
      </aside>
      <main className="flex-1 p-8 overflow-x-hidden">{children}</main>
    </div>
  );
}
