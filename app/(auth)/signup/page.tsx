import Link from "next/link";
import { signup } from "./actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-3xl font-semibold text-center">Crear cuenta</h1>
        <form action={signup} className="space-y-3">
          <input
            name="organization_name"
            type="text"
            required
            placeholder="Nombre del negocio (ej. Clínica Dental Norte)"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
          />
          <input
            name="full_name"
            type="text"
            required
            autoComplete="name"
            placeholder="Tu nombre"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
          />
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="tucorreo@ejemplo.com"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
          />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Contraseña (mín. 8 caracteres)"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
          />
          {params.error ? <p className="text-sm text-red-400">{params.error}</p> : null}
          {params.message ? <p className="text-sm text-emerald-400">{params.message}</p> : null}
          <button
            type="submit"
            className="w-full rounded-lg bg-white text-black font-medium px-3 py-2 hover:bg-neutral-200 transition"
          >
            Crear cuenta
          </button>
        </form>
        <p className="text-sm text-center text-neutral-400">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="underline hover:text-white">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
