import Link from "next/link";

export default function Landing() {
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-neutral-900">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">Estate</span>
            <span className="text-xs text-neutral-500 uppercase tracking-widest">Costa Blanca</span>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/login" className="text-neutral-400 hover:text-white transition">Acceder</Link>
            <Link
              href="/signup"
              className="rounded-lg bg-white text-black px-4 py-2 font-medium hover:bg-neutral-200 transition"
            >
              Solicitar demo
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-24 text-center space-y-6">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Asistente virtual para inmobiliarias de lujo</p>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] max-w-3xl mx-auto">
          Convierte cada WhatsApp en una visita agendada.
        </h1>
        <p className="text-lg text-neutral-400 max-w-2xl mx-auto">
          Estate atiende a sus clientes internacionales 24/7 en su propio idioma, les envía las
          villas que encajan con sus criterios y agenda visitas directamente en su agenda de Google Calendar.
        </p>
        <div className="flex items-center justify-center gap-3 pt-4">
          <Link
            href="/signup"
            className="rounded-lg bg-white text-black px-6 py-3 font-medium hover:bg-neutral-200 transition"
          >
            Empezar prueba gratuita
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-neutral-700 px-6 py-3 font-medium hover:bg-neutral-900 transition"
          >
            Ver panel
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Feature
          title="Multi-idioma nativo"
          body="Responde con fluidez en inglés, alemán, holandés, francés, sueco, noruego, italiano, ruso y español — detecta el idioma del cliente y adapta el tono."
        />
        <Feature
          title="Catálogo con fotos"
          body="Envía por WhatsApp la ficha detallada de la propiedad con hasta 5 fotografías profesionales, precio y tour virtual."
        />
        <Feature
          title="Agenda inteligente"
          body="Comprueba disponibilidad real en Google Calendar y agenda visitas presenciales, videollamadas o llamadas informativas."
        />
        <Feature
          title="Cualificación automática"
          body="Descubre presupuesto, zonas de interés, timeline y forma de financiación sin interrogar. Prioriza los leads más maduros."
        />
        <Feature
          title="Panel para el equipo"
          body="Cada agente ve sus visitas, sus clientes cualificados y puede tomar el hilo de una conversación cuando la operación se complica."
        />
        <Feature
          title="Discreción y seguridad"
          body="Cifrado AES-256-GCM para credenciales, aislamiento por agencia, cumplimiento GDPR y notificación de brechas en 72h."
        />
      </section>

      <section className="max-w-4xl mx-auto px-6 py-24 text-center space-y-6 border-t border-neutral-900">
        <h2 className="text-3xl font-semibold tracking-tight">Pensado para Jávea, Moraira, Denia, Calpe y Altea.</h2>
        <p className="text-neutral-400">
          Diseñado con las particularidades del mercado de alto standing de la Costa Blanca:
          clientela extranjera, tickets a partir de 800k€ y equipos comerciales pequeños que necesitan filtrar antes de invertir tiempo.
        </p>
      </section>

      <footer className="border-t border-neutral-900 text-xs text-neutral-500">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <div>© 2026 Estate — Asistente virtual para inmobiliarias de lujo.</div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-white transition">Privacidad</Link>
            <Link href="/terms" className="hover:text-white transition">Condiciones</Link>
            <Link href="/data-deletion" className="hover:text-white transition">Eliminación de datos</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-6">
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <p className="text-sm text-neutral-400 leading-relaxed">{body}</p>
    </div>
  );
}
