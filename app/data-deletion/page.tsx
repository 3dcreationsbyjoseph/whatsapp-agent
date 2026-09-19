import Link from "next/link";

export const metadata = {
  title: "Eliminación de datos — WhatsApp Agent Miclinica",
  description:
    "Instrucciones para solicitar la eliminación de tus datos personales del asistente virtual de WhatsApp.",
};

export default function DataDeletion() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-neutral-100">
      <div className="mb-8">
        <Link href="/" className="text-sm text-neutral-400 hover:text-white">
          ← Volver al inicio
        </Link>
      </div>

      <article className="prose prose-invert prose-neutral max-w-none space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Eliminación de datos personales
          </h1>
          <p className="text-sm text-neutral-400">
            Última actualización: 19 de septiembre de 2026
          </p>
        </header>

        <section className="space-y-3">
          <p>
            En <strong>WhatsApp Agent Miclinica</strong>, operado por{" "}
            <strong>Josep Ferrer</strong>, respetamos tu derecho a controlar tus datos
            personales. Esta página describe cómo puedes solicitar la eliminación de todos los
            datos personales que hayamos recopilado sobre ti a través del asistente virtual de
            WhatsApp o del panel de administración.
          </p>
          <p>
            Este derecho está garantizado por el artículo 17 del{" "}
            <strong>Reglamento General de Protección de Datos (RGPD)</strong> y la{" "}
            <strong>Ley Orgánica 3/2018 (LOPDGDD)</strong>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">1. Qué datos se eliminarán</h2>
          <p>Al aceptar tu solicitud, se eliminarán de nuestros sistemas:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Tu nombre completo.</li>
            <li>Tu número de teléfono asociado a la cuenta.</li>
            <li>El historial completo de conversaciones de WhatsApp.</li>
            <li>Datos de citas pasadas (respetando las obligaciones legales de conservación).</li>
            <li>
              Si eres administrador de una clínica: tu cuenta de usuario, credenciales y
              configuración asociada.
            </li>
            <li>Logs técnicos que puedan asociarse a ti (IP, dispositivo, actividad).</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">2. Cómo solicitar la eliminación</h2>
          <p>
            Tienes <strong>dos formas</strong> de solicitar la eliminación de tus datos, ambas
            gratuitas:
          </p>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5 space-y-2">
            <h3 className="text-lg font-medium">Opción A — Por WhatsApp</h3>
            <p>
              Envía un mensaje al número de WhatsApp de la clínica con el texto:
            </p>
            <pre className="rounded bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm">
              Solicito la eliminación de mis datos personales conforme al artículo 17 del RGPD.
            </pre>
            <p className="text-sm text-neutral-400">
              El asistente virtual escalará automáticamente la petición al responsable, que
              procesará la eliminación.
            </p>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5 space-y-2">
            <h3 className="text-lg font-medium">Opción B — Por correo electrónico</h3>
            <p>Envía un email al correo de contacto de la clínica indicando:</p>
            <ul className="list-disc list-inside text-sm text-neutral-300 space-y-1">
              <li>Asunto: &quot;Solicitud de eliminación de datos (RGPD)&quot;.</li>
              <li>Tu nombre completo.</li>
              <li>
                Número de teléfono asociado a tu WhatsApp (si has interactuado con el bot).
              </li>
              <li>
                Correo electrónico registrado (si eres administrador de una clínica).
              </li>
              <li>
                Copia o referencia de un documento identificativo (para prevenir suplantaciones
                — puedes tachar los datos no imprescindibles).
              </li>
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">3. Plazo de respuesta</h2>
          <p>
            Procesaremos tu solicitud en un plazo <strong>máximo de 30 días naturales</strong>{" "}
            desde su recepción, conforme al artículo 12 del RGPD. Recibirás una confirmación
            escrita una vez completada la eliminación.
          </p>
          <p>
            En casos excepcionales de especial complejidad, este plazo puede prorrogarse otros
            dos meses adicionales, lo que se te comunicará en el plazo del primer mes junto con
            los motivos.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">4. Excepciones a la eliminación</h2>
          <p>
            Algunos datos podrán conservarse durante el tiempo necesario para cumplir
            obligaciones legales, en particular:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Datos fiscales y contables</strong>: hasta 4 años, según la Ley General
              Tributaria.
            </li>
            <li>
              <strong>Registros de citas facturadas</strong>: hasta 6 años, según el Código de
              Comercio.
            </li>
            <li>
              <strong>Datos necesarios para ejercer o defender frente a reclamaciones</strong>{" "}
              legales durante el plazo de prescripción de la acción correspondiente.
            </li>
          </ul>
          <p>
            Estos datos se mantendrán únicamente bloqueados (no accesibles para uso ordinario)
            hasta la extinción de la obligación legal, y después se eliminarán definitivamente.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">5. Datos alojados en terceros</h2>
          <p>
            Como parte de la eliminación, también se borrarán tus datos de los sistemas de los
            encargados del tratamiento que usamos:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Supabase (base de datos): borrado completo.</li>
            <li>Google Calendar: cancelación y eliminación de eventos relacionados.</li>
            <li>Anthropic: los mensajes procesados no se almacenan más allá del turno de conversación.</li>
            <li>Meta / WhatsApp: los mensajes en los servidores de Meta se rigen por sus propias políticas de retención; puedes borrar tu historial local desde tu propia aplicación de WhatsApp.</li>
            <li>Vercel: los logs de servidor se eliminan según los plazos establecidos.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">6. Derecho a reclamar</h2>
          <p>
            Si consideras que no hemos atendido correctamente tu solicitud, puedes presentar
            una reclamación ante la{" "}
            <strong>Agencia Española de Protección de Datos</strong> (
            <a
              href="https://www.aepd.es"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              www.aepd.es
            </a>
            ), autoridad de control competente en España.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">7. Más información</h2>
          <p>
            Para más detalles sobre cómo tratamos tus datos, consulta nuestra{" "}
            <Link href="/privacy" className="underline">
              Política de Privacidad
            </Link>
            .
          </p>
        </section>
      </article>

      <footer className="mt-16 border-t border-neutral-800 pt-6 text-xs text-neutral-500">
        © 2026 Josep Ferrer — WhatsApp Agent Miclinica. Todos los derechos reservados.
      </footer>
    </main>
  );
}
