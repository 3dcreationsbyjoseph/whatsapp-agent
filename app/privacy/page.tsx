import Link from "next/link";

export const metadata = {
  title: "Política de privacidad — WhatsApp Agent Miclinica",
  description:
    "Política de privacidad del asistente virtual de WhatsApp para gestión de citas dentales, en conformidad con el GDPR y la LOPDGDD española.",
};

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-neutral-100">
      <div className="mb-8">
        <Link href="/" className="text-sm text-neutral-400 hover:text-white">
          ← Volver al inicio
        </Link>
      </div>

      <article className="prose prose-invert prose-neutral max-w-none space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Política de privacidad</h1>
          <p className="text-sm text-neutral-400">
            Última actualización: 19 de septiembre de 2026
          </p>
        </header>

        <section className="space-y-3">
          <p>
            Esta Política de Privacidad describe cómo <strong>Josep Ferrer</strong>{" "}
            (operando como <strong>WhatsApp Agent Miclinica</strong>, en adelante &quot;nosotros&quot;,
            &quot;nuestro&quot; o &quot;el Servicio&quot;) recopila, usa y comparte información
            personal cuando utilizas nuestro asistente virtual de WhatsApp para gestión de citas
            dentales, disponible en{" "}
            <code>https://whatsapp-agent-tau-jade.vercel.app</code>.
          </p>
          <p>
            Tratamos tus datos personales conforme al Reglamento (UE) 2016/679 del Parlamento
            Europeo y del Consejo, de 27 de abril de 2016 (<strong>RGPD</strong>) y a la Ley
            Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de
            los derechos digitales (<strong>LOPDGDD</strong>).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">1. Responsable del tratamiento</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Titular:</strong> Josep Ferrer, operando como WhatsApp Agent Miclinica
            </li>
            <li>
              <strong>Correo de contacto:</strong> a través del formulario en la app o el correo
              de privacidad que hayas facilitado a la clínica.
            </li>
            <li>
              <strong>Delegado de Protección de Datos (DPD):</strong> Josep Ferrer, con el
              mismo domicilio y contacto arriba indicados.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">2. Datos que recopilamos</h2>
          <p>Recopilamos únicamente los datos necesarios para prestar el servicio:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Nombre completo del paciente o de quien agenda la cita.</li>
            <li>Número de teléfono de WhatsApp (proporcionado automáticamente por Meta).</li>
            <li>
              Correo electrónico y contraseña, únicamente si eres el titular de una clínica que
              se registra en el panel de administración.
            </li>
            <li>
              Contenido de los mensajes de WhatsApp intercambiados con el asistente virtual.
            </li>
            <li>
              Datos de la cita: servicio, fecha, hora, indicación de si eres paciente nuevo,
              notas opcionales.
            </li>
            <li>
              Datos técnicos automáticos: dirección IP, tipo de navegador y dispositivo,
              timestamps de las peticiones (logs de servidor).
            </li>
          </ul>
          <p>
            <strong>No recopilamos</strong> datos bancarios, historial médico, datos
            biométricos, ni datos de geolocalización.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">3. Finalidades y base legal</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Gestionar citas dentales</strong> (agendar, consultar, modificar, cancelar):
              base legal <em>ejecución de un contrato</em> (art. 6.1.b RGPD).
            </li>
            <li>
              <strong>Responder a tus consultas por WhatsApp</strong>: base legal ejecución del
              contrato o interés legítimo.
            </li>
            <li>
              <strong>Enviar confirmaciones y recordatorios de cita</strong>: base legal
              ejecución del contrato.
            </li>
            <li>
              <strong>Cumplir obligaciones legales</strong> (contabilidad, tributación,
              conservación durante 4 años según la normativa fiscal): art. 6.1.c RGPD.
            </li>
            <li>
              <strong>Prevención del fraude y seguridad del servicio</strong>: interés legítimo
              (art. 6.1.f RGPD).
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">4. Encargados del tratamiento y terceros</h2>
          <p>
            Compartimos datos únicamente con los proveedores de infraestructura necesarios para
            prestar el servicio, todos ellos con Acuerdos de Encargo de Tratamiento firmados y
            garantías adecuadas para transferencias internacionales:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Meta Platforms Ireland Ltd.</strong> — canal de mensajería (WhatsApp
              Business Platform).
            </li>
            <li>
              <strong>Anthropic PBC</strong> — modelo de lenguaje que impulsa las respuestas del
              asistente virtual.
            </li>
            <li>
              <strong>Google LLC</strong> — integración con Google Calendar para la gestión de
              citas.
            </li>
            <li>
              <strong>Supabase Inc.</strong> — base de datos, autenticación e infraestructura en
              tiempo real.
            </li>
            <li>
              <strong>Vercel Inc.</strong> — hosting y ejecución de funciones serverless.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">5. Transferencias internacionales</h2>
          <p>
            Algunos de los proveedores anteriores procesan datos fuera del Espacio Económico
            Europeo (principalmente en Estados Unidos). Estas transferencias están amparadas por
            las <strong>Cláusulas Contractuales Tipo</strong> aprobadas por la Comisión Europea
            (Decisión 2021/914) y, cuando procede, por el <strong>EU-US Data Privacy Framework</strong>{" "}
            al que están adheridos los procesadores estadounidenses.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">6. Plazos de conservación</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Mensajes de conversación</strong>: 12 meses desde la última interacción.
            </li>
            <li>
              <strong>Datos de contacto</strong>: hasta que solicites su supresión.
            </li>
            <li>
              <strong>Datos de citas</strong>: 24 meses desde la fecha de la cita (obligaciones
              contables y legales).
            </li>
            <li>
              <strong>Logs técnicos y de seguridad</strong>: 12 meses desde la última
              interacción.
            </li>
            <li>
              <strong>Cuenta de administrador</strong>: mientras la cuenta esté activa; se
              suprime al solicitar la baja.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">7. Tus derechos</h2>
          <p>
            Como interesado tienes los siguientes derechos, que puedes ejercer contactándonos
            por email o por WhatsApp:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Acceso a tus datos personales.</li>
            <li>Rectificación de datos inexactos o incompletos.</li>
            <li>Supresión (&quot;derecho al olvido&quot;).</li>
            <li>Limitación del tratamiento.</li>
            <li>Portabilidad de los datos.</li>
            <li>Oposición al tratamiento basado en interés legítimo.</li>
            <li>
              No ser objeto de decisiones automatizadas con efectos jurídicos significativos.
            </li>
            <li>
              Retirar el consentimiento en cualquier momento, sin efectos retroactivos.
            </li>
          </ul>
          <p>
            Si consideras que hemos vulnerado tus derechos, puedes presentar una reclamación
            ante la <strong>Agencia Española de Protección de Datos</strong> (
            <a
              href="https://www.aepd.es"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              www.aepd.es
            </a>
            ).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">8. Menores de edad</h2>
          <p>
            El servicio no está dirigido a menores de 14 años. Si un menor de 14 años ha
            proporcionado datos personales, su representante legal puede contactarnos para
            solicitar su supresión inmediata.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">9. Medidas de seguridad</h2>
          <p>Aplicamos medidas técnicas y organizativas apropiadas, incluyendo:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Cifrado en tránsito mediante HTTPS/TLS.</li>
            <li>
              Cifrado en reposo con AES-256-GCM para tokens y credenciales de terceros
              almacenados en base de datos.
            </li>
            <li>Aislamiento multi-tenant mediante Row Level Security en la base de datos.</li>
            <li>Almacenamiento de contraseñas con hash mediante algoritmos robustos.</li>
            <li>
              Notificación a la Agencia Española de Protección de Datos en un plazo máximo de
              72 horas ante cualquier brecha de seguridad, conforme al artículo 33 del RGPD.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">10. Cookies</h2>
          <p>
            Utilizamos exclusivamente <strong>cookies técnicas esenciales</strong> para
            mantener la sesión de administración iniciada. No usamos cookies analíticas ni
            publicitarias, y no compartimos datos con plataformas de publicidad o marketing.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">11. Cambios en esta política</h2>
          <p>
            Podemos actualizar esta política ocasionalmente. Los cambios se publicarán en esta
            página con una nueva fecha de &quot;Última actualización&quot;. Cambios sustanciales se
            comunicarán además por los canales de contacto que dispongamos.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">12. Contacto</h2>
          <p>
            Para cualquier consulta sobre esta política o el ejercicio de tus derechos, puedes
            contactar con nosotros:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              Enviando un mensaje al asistente virtual de WhatsApp de la clínica.
            </li>
            <li>Escribiendo al correo de contacto que la clínica te haya proporcionado.</li>
          </ul>
        </section>
      </article>

      <footer className="mt-16 border-t border-neutral-800 pt-6 text-xs text-neutral-500">
        © 2026 Josep Ferrer — WhatsApp Agent Miclinica. Todos los derechos reservados.
      </footer>
    </main>
  );
}
