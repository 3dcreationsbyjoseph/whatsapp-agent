import Link from "next/link";

export const metadata = {
  title: "Condiciones de uso — WhatsApp Agent Miclinica",
  description:
    "Condiciones de uso del asistente virtual de WhatsApp para gestión de citas dentales.",
};

export default function TermsOfService() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-neutral-100">
      <div className="mb-8">
        <Link href="/" className="text-sm text-neutral-400 hover:text-white">
          ← Volver al inicio
        </Link>
      </div>

      <article className="prose prose-invert prose-neutral max-w-none space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Condiciones de uso</h1>
          <p className="text-sm text-neutral-400">
            Última actualización: 19 de septiembre de 2026
          </p>
        </header>

        <section className="space-y-3">
          <p>
            Bienvenido/a a <strong>WhatsApp Agent Miclinica</strong> (en adelante, &quot;el
            Servicio&quot;), operado por <strong>Josep Ferrer</strong> (en adelante,
            &quot;nosotros&quot;, &quot;nuestro&quot;). Estas Condiciones de uso regulan el
            acceso y utilización del Servicio, incluyendo el sitio web{" "}
            <code>https://whatsapp-agent-tau-jade.vercel.app</code> y el asistente virtual de
            WhatsApp asociado.
          </p>
          <p>
            Al utilizar el Servicio, aceptas quedar vinculado por las presentes Condiciones. Si
            no estás de acuerdo, por favor no utilices el Servicio.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">1. Descripción del Servicio</h2>
          <p>
            WhatsApp Agent Miclinica es un asistente virtual conversacional que permite a los
            pacientes de una clínica dental agendar, consultar, modificar y cancelar citas
            mediante mensajes de WhatsApp, así como acceder a información básica del negocio.
            El Servicio se integra con la agenda de la clínica (Google Calendar) para gestionar
            la disponibilidad y confirmar las citas.
          </p>
          <p>
            El Servicio no sustituye la consulta profesional ni ofrece diagnóstico médico ni
            asesoramiento clínico.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">2. Requisitos para el uso</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>
              Debes ser mayor de 14 años. Los menores de 14 años necesitan el consentimiento
              expreso de su representante legal.
            </li>
            <li>
              Debes proporcionar información veraz, precisa y actualizada al agendar citas o
              registrarte como usuario administrador.
            </li>
            <li>
              Eres responsable de mantener la confidencialidad de tus credenciales de acceso al
              panel de administración, si aplica.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">3. Uso aceptable</h2>
          <p>Al usar el Servicio, te comprometes a no:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Usar el Servicio con fines ilícitos o fraudulentos.</li>
            <li>
              Suplantar la identidad de otra persona o proporcionar información falsa para
              agendar citas.
            </li>
            <li>
              Enviar contenido ofensivo, amenazante, difamatorio, discriminatorio o inapropiado.
            </li>
            <li>
              Intentar manipular, sobrecargar o comprometer la seguridad del asistente virtual,
              incluyendo intentos de inyección de instrucciones (&quot;prompt injection&quot;).
            </li>
            <li>
              Utilizar el Servicio para hacer spam, envío masivo o cualquier uso no relacionado
              con la finalidad legítima del agendamiento de citas.
            </li>
            <li>
              Realizar ingeniería inversa, descompilar o intentar acceder al código fuente del
              Servicio.
            </li>
          </ul>
          <p>
            El incumplimiento de estas condiciones podrá dar lugar a la suspensión o
            cancelación inmediata del acceso al Servicio.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">4. Naturaleza automatizada del Servicio</h2>
          <p>
            El asistente virtual utiliza tecnología de inteligencia artificial (modelos de
            lenguaje) para procesar tus mensajes y generar respuestas. Aunque hacemos esfuerzos
            razonables para garantizar la calidad de las respuestas, éstas pueden contener
            errores. La confirmación oficial de una cita será la que aparezca en el sistema de
            la clínica.
          </p>
          <p>
            Ante cualquier duda, la clínica se reserva el derecho de revisar y, si procede,
            corregir o cancelar citas agendadas a través del asistente.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">5. Citas y cancelaciones</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>
              Las citas están sujetas a la disponibilidad real de la clínica y su calendario.
            </li>
            <li>
              Los usuarios pueden cancelar o modificar sus citas a través del asistente hasta el
              momento previo a la hora de la cita.
            </li>
            <li>
              Las políticas específicas de cancelación, no presentación (&quot;no show&quot;) o
              reprogramación son responsabilidad de la clínica y serán comunicadas por ella al
              paciente cuando proceda.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">6. Propiedad intelectual</h2>
          <p>
            El código, diseño, marca, textos, gráficos, logotipos e imágenes del Servicio son
            propiedad de Josep Ferrer o de sus respectivos titulares y están protegidos por la
            legislación española y europea sobre propiedad intelectual e industrial.
          </p>
          <p>
            El uso del Servicio no otorga al usuario ningún derecho o licencia sobre dichos
            elementos, salvo el derecho estrictamente necesario para utilizar el Servicio con
            su finalidad prevista.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">7. Servicios de terceros</h2>
          <p>
            El Servicio se apoya en infraestructura y servicios de terceros (Meta / WhatsApp,
            Anthropic, Google, Supabase, Vercel). Estos terceros tienen sus propias condiciones
            y políticas de privacidad, que también te resultan aplicables al utilizar el
            Servicio. No somos responsables de la disponibilidad o del contenido de estos
            servicios de terceros.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">8. Limitación de responsabilidad</h2>
          <p>
            En la máxima medida permitida por la legislación aplicable, el Servicio se presta
            &quot;tal cual&quot; y &quot;según disponibilidad&quot;. No garantizamos que el
            Servicio esté libre de errores, interrupciones o retrasos, ni que satisfaga
            requisitos específicos del usuario.
          </p>
          <p>
            No seremos responsables de daños indirectos, incidentales, especiales o
            consecuentes derivados del uso o imposibilidad de uso del Servicio, salvo en los
            casos en que la legislación española imponga una responsabilidad no excluible.
          </p>
          <p>
            Esta limitación no afecta a los derechos que la ley reconoce a los consumidores.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">9. Protección de datos</h2>
          <p>
            El tratamiento de los datos personales se rige por nuestra{" "}
            <Link href="/privacy" className="underline">
              Política de Privacidad
            </Link>
            , que forma parte integrante de estas Condiciones.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">10. Suspensión y terminación</h2>
          <p>
            Podemos suspender o dar por terminado tu acceso al Servicio, con o sin previo
            aviso, si consideramos que has infringido estas Condiciones o si el uso del
            Servicio pone en riesgo su integridad o la de terceros. En caso de terminación,
            algunas obligaciones (limitación de responsabilidad, propiedad intelectual,
            legislación aplicable) permanecerán vigentes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">11. Modificaciones</h2>
          <p>
            Podemos actualizar estas Condiciones ocasionalmente. Los cambios entrarán en vigor
            a partir de su publicación en esta página, con actualización de la fecha de
            &quot;Última actualización&quot;. Si los cambios son sustanciales, procuraremos
            comunicarlos por los canales disponibles.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">12. Legislación aplicable y jurisdicción</h2>
          <p>
            Estas Condiciones se rigen por la legislación española. Para la resolución de
            cualquier controversia derivada del uso del Servicio, las partes se someten a los
            juzgados y tribunales del domicilio del usuario cuando actúe como consumidor, o a
            los del domicilio de Josep Ferrer en los demás casos, salvo que una norma
            imperativa disponga otro fuero.
          </p>
          <p>
            Como consumidor puedes también acudir a la plataforma europea de resolución de
            litigios en línea:{" "}
            <a
              href="https://ec.europa.eu/consumers/odr"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              ec.europa.eu/consumers/odr
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">13. Contacto</h2>
          <p>
            Para cualquier consulta relacionada con estas Condiciones de uso, puedes contactar
            con nosotros a través del asistente virtual de WhatsApp de la clínica o del correo
            de contacto que ésta te haya facilitado.
          </p>
        </section>
      </article>

      <footer className="mt-16 border-t border-neutral-800 pt-6 text-xs text-neutral-500">
        © 2026 Josep Ferrer — WhatsApp Agent Miclinica. Todos los derechos reservados.
      </footer>
    </main>
  );
}
