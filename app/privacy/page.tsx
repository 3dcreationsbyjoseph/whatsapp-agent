import Link from "next/link";

export const metadata = {
  title: "Política de privacidad — Estate",
  description:
    "Política de privacidad del asistente virtual de WhatsApp para agencias inmobiliarias de lujo en la Costa Blanca, en conformidad con el GDPR y la LOPDGDD.",
};

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-neutral-100">
      <div className="mb-8">
        <Link href="/" className="text-sm text-neutral-400 hover:text-white">← Volver al inicio</Link>
      </div>

      <article className="prose prose-invert prose-neutral max-w-none space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Política de privacidad</h1>
          <p className="text-sm text-neutral-400">Última actualización: 19 de septiembre de 2026</p>
        </header>

        <section className="space-y-3">
          <p>
            Esta Política de Privacidad describe cómo <strong>Estate</strong> (en adelante, &quot;nosotros&quot;, &quot;nuestro&quot; o &quot;el Servicio&quot;),
            asistente virtual de WhatsApp para agencias inmobiliarias de lujo en la Costa Blanca,
            recopila, usa y comparte información personal cuando interactúas con nuestro asistente
            o con el panel de administración disponible en <code>https://whatsapp-agent-tau-jade.vercel.app</code>.
          </p>
          <p>
            Tratamos tus datos personales conforme al <strong>Reglamento (UE) 2016/679 (RGPD)</strong> y a la
            <strong> Ley Orgánica 3/2018 (LOPDGDD)</strong>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">1. Responsable del tratamiento</h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Responsable:</strong> Josep Ferrer, operando como Estate.</li>
            <li><strong>Delegado de Protección de Datos (DPD):</strong> Josep Ferrer.</li>
            <li><strong>Contacto:</strong> a través del asistente virtual de WhatsApp de la agencia o del correo indicado por ésta.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">2. Datos que recopilamos</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Nombre completo del interesado.</li>
            <li>Número de teléfono de WhatsApp (proporcionado automáticamente por Meta).</li>
            <li>Idioma de conversación.</li>
            <li>Correo electrónico y contraseña, únicamente si eres administrador de una agencia con acceso al panel.</li>
            <li>Contenido de los mensajes de WhatsApp.</li>
            <li>Criterios de búsqueda inmobiliaria (presupuesto, zonas, tipo, dormitorios, timeline y forma de financiación).</li>
            <li>Datos de las visitas agendadas (propiedad, fecha, hora, tipo de visita, notas).</li>
            <li>Datos técnicos automáticos: IP, tipo de navegador, dispositivo y timestamps.</li>
          </ul>
          <p><strong>No recopilamos</strong> datos bancarios, biométricos ni de salud.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">3. Finalidades y base legal</h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Atender consultas y ofrecerte propiedades</strong>: ejecución de contrato (art. 6.1.b RGPD).</li>
            <li><strong>Agendar visitas a propiedades</strong>: ejecución de contrato.</li>
            <li><strong>Cualificar tu perfil</strong> como potencial comprador (interés legítimo — art. 6.1.f RGPD).</li>
            <li><strong>Cumplir obligaciones legales</strong> (contables, fiscales, comerciales): art. 6.1.c RGPD.</li>
            <li><strong>Prevención de fraude y seguridad</strong> del asistente virtual: interés legítimo.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">4. Encargados del tratamiento</h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Meta Platforms Ireland Ltd.</strong> — canal de mensajería WhatsApp Business.</li>
            <li><strong>Anthropic PBC</strong> — modelo de lenguaje del asistente.</li>
            <li><strong>Google LLC</strong> — integración con Google Calendar.</li>
            <li><strong>Supabase Inc.</strong> — base de datos, autenticación e infraestructura en tiempo real.</li>
            <li><strong>Vercel Inc.</strong> — hosting y funciones serverless.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">5. Transferencias internacionales</h2>
          <p>
            Algunos proveedores procesan datos fuera del Espacio Económico Europeo (principalmente en Estados Unidos).
            Estas transferencias están amparadas por las <strong>Cláusulas Contractuales Tipo</strong> de la Comisión Europea
            (Decisión 2021/914) y el <strong>EU-US Data Privacy Framework</strong>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">6. Plazos de conservación</h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Mensajes</strong>: 12 meses desde la última interacción.</li>
            <li><strong>Datos de contacto y criterios de búsqueda</strong>: hasta que solicites su supresión.</li>
            <li><strong>Datos de visitas agendadas</strong>: 24 meses.</li>
            <li><strong>Logs técnicos</strong>: 12 meses.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">7. Tus derechos</h2>
          <p>Puedes ejercer los siguientes derechos escribiéndonos por WhatsApp o email:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Acceso, rectificación, supresión, limitación, portabilidad, oposición.</li>
            <li>No ser objeto de decisiones automatizadas con efectos jurídicos significativos.</li>
            <li>Retirar el consentimiento en cualquier momento.</li>
          </ul>
          <p>
            Puedes reclamar ante la <strong>Agencia Española de Protección de Datos</strong> (
            <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="underline">www.aepd.es</a>).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">8. Medidas de seguridad</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Cifrado en tránsito (HTTPS/TLS).</li>
            <li>Cifrado en reposo AES-256-GCM para credenciales de terceros.</li>
            <li>Aislamiento multi-tenant por agencia (Row Level Security).</li>
            <li>Contraseñas almacenadas con hash robusto.</li>
            <li>Notificación de brechas a la AEPD en 72 horas (art. 33 RGPD).</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">9. Cookies</h2>
          <p>Solo utilizamos cookies técnicas esenciales de sesión. No usamos cookies analíticas ni publicitarias.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">10. Cambios</h2>
          <p>Actualizaremos esta política cuando sea necesario. Los cambios se publican en esta página con la fecha correspondiente.</p>
        </section>
      </article>

      <footer className="mt-16 border-t border-neutral-800 pt-6 text-xs text-neutral-500">
        © 2026 Estate — Asistente virtual para inmobiliarias de lujo.
      </footer>
    </main>
  );
}
