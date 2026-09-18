import Link from "next/link";

export default function Landing() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">WhatsApp Agent</h1>
        <p className="text-lg text-neutral-400">
          Agente IA de atención al cliente por WhatsApp para clínicas dentales y otros
          negocios con agendamiento de citas.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-white text-black px-5 py-2.5 font-medium hover:bg-neutral-200 transition"
          >
            Crear cuenta
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-neutral-700 px-5 py-2.5 font-medium hover:bg-neutral-900 transition"
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  );
}
