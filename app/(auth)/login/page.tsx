import Link from "next/link";
import { login } from "./actions";

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  return <LoginForm searchParams={searchParams} />;
}

async function LoginForm({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-3xl font-semibold text-center">Iniciar sesión</h1>
        <form action={login} className="space-y-3">
          <input type="hidden" name="next" value={params.next ?? "/dashboard"} />
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
            autoComplete="current-password"
            placeholder="Contraseña"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
          />
          {params.error ? <p className="text-sm text-red-400">{params.error}</p> : null}
          <button
            type="submit"
            className="w-full rounded-lg bg-white text-black font-medium px-3 py-2 hover:bg-neutral-200 transition"
          >
            Entrar
          </button>
        </form>
        <p className="text-sm text-center text-neutral-400">
          ¿No tienes cuenta?{" "}
          <Link href="/signup" className="underline hover:text-white">
            Crear una
          </Link>
        </p>
      </div>
    </main>
  );
}
