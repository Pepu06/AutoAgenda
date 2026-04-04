import styles from './terms.module.css';

export const metadata = {
  title: 'Condiciones del Servicio - RecordAI',
  description: 'Términos y condiciones de uso de RecordAI',
};

export default function TermsPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1>Condiciones del Servicio (ToS)</h1>
        <p className={styles.updated}>Última actualización: Abril 2026</p>

        <section>
          <h2>1. Aceptación de los Términos</h2>
          <p>
            Al utilizar RecordAI ("el Servicio"), usted acepta estar legalmente vinculado por estas Condiciones del Servicio. 
            Si no está de acuerdo con estos términos, no utilice el Servicio.
          </p>
        </section>

        <section>
          <h2>2. Descripción del Servicio</h2>
          <p>RecordAI es un servicio de automatización que:</p>
          <ul>
            <li>Se conecta a su cuenta de Google Calendar mediante autenticación OAuth 2.0</li>
            <li>Lee los eventos programados en su calendario</li>
            <li>Extrae información de contacto (números de teléfono) desde la descripción de los eventos</li>
            <li>Envía recordatorios automáticos por WhatsApp a sus clientes antes de las citas programadas</li>
          </ul>
          <p>
            El servicio está diseñado para profesionales de la salud, consultores y otros profesionales que necesitan 
            recordar citas a sus clientes.
          </p>
        </section>

        <section>
          <h2>3. Consentimiento para Acceder a Google Calendar</h2>
          <p>Al autorizar el acceso a su Google Calendar, usted:</p>
          <ul>
            <li><strong>Otorga permiso explícito</strong> para que el Servicio lea los eventos de su calendario</li>
            <li><strong>Confirma que tiene derecho</strong> a compartir la información contenida en los eventos (incluidos los números de teléfono de terceros)</li>
            <li><strong>Acepta que es su responsabilidad</strong> obtener el consentimiento de sus clientes para enviarles mensajes de WhatsApp</li>
            <li>
              <strong>Reconoce que puede revocar</strong> este acceso en cualquier momento desde su{' '}
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
                cuenta de Google
              </a>
            </li>
          </ul>
        </section>

        <section>
          <h2>4. Responsabilidades del Usuario</h2>
          <p>Como usuario del Servicio, usted se compromete a:</p>

          <h3>4.1 Uso Apropiado</h3>
          <ul>
            <li>Usar el Servicio únicamente para fines legales y profesionales</li>
            <li>No enviar mensajes no solicitados (spam) o contenido abusivo</li>
            <li>Obtener el consentimiento previo de sus clientes para recibir recordatorios por WhatsApp</li>
            <li>Cumplir con las leyes locales de protección de datos y privacidad</li>
          </ul>

          <h3>4.2 Formato de Datos</h3>
          <ul>
            <li>Incluir números de teléfono en formato correcto (con código de país) en la descripción de los eventos</li>
            <li>Proporcionar información precisa y actualizada en su calendario</li>
            <li>Mantener la seguridad de su cuenta de Google Calendar</li>
          </ul>

          <h3>4.3 Uso de WhatsApp</h3>
          <ul>
            <li>
              Cumplir con los{' '}
              <a href="https://www.whatsapp.com/legal/business-terms" target="_blank" rel="noopener noreferrer">
                Términos de Servicio de WhatsApp Business
              </a>
            </li>
            <li>No utilizar el servicio para enviar mensajes masivos no relacionados con citas</li>
            <li>Respetar las preferencias de comunicación de sus clientes</li>
          </ul>
        </section>

        <section>
          <h2>5. Limitación de Responsabilidad</h2>

          <h3>5.1 Errores en el Envío de Mensajes</h3>
          <p className={styles.disclaimer}>
            EL SERVICIO SE PROPORCIONA "TAL CUAL" Y "SEGÚN DISPONIBILIDAD". <strong>NO GARANTIZAMOS:</strong>
          </p>
          <ul>
            <li>Que todos los mensajes se entregarán exitosamente</li>
            <li>La puntualidad exacta en el envío de recordatorios</li>
            <li>Que el servicio estará disponible de forma ininterrumpida</li>
            <li>La ausencia de errores técnicos o fallos en la API de WhatsApp</li>
          </ul>

          <h3>5.2 Responsabilidad por Contenido</h3>
          <p>Usted es <strong>el único responsable</strong> de:</p>
          <ul>
            <li>El contenido de los mensajes enviados a sus clientes</li>
            <li>La exactitud de los datos en su Google Calendar</li>
            <li>Cualquier daño o pérdida resultante de errores en la información de las citas</li>
            <li>Las consecuencias de citas perdidas o recordatorios no entregados</li>
          </ul>

          <h3>5.3 Exclusión de Daños</h3>
          <p className={styles.disclaimer}>
            EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY, NO SEREMOS RESPONSABLES POR:
          </p>
          <ul>
            <li>Daños directos, indirectos, incidentales, especiales o consecuentes</li>
            <li>Pérdida de ingresos, ganancias, datos o uso</li>
            <li>Citas perdidas debido a fallos técnicos</li>
            <li>Quejas de clientes relacionadas con los recordatorios</li>
          </ul>
        </section>

        <section>
          <h2>6. Disponibilidad del Servicio</h2>

          <h3>6.1 Interrupciones</h3>
          <p>Nos reservamos el derecho de:</p>
          <ul>
            <li>Suspender temporalmente el servicio para mantenimiento programado (con aviso previo de 24 horas)</li>
            <li>Realizar mantenimiento de emergencia sin previo aviso</li>
            <li>Modificar o descontinuar funcionalidades con 30 días de aviso</li>
          </ul>

          <h3>6.2 Dependencias de Terceros</h3>
          <p>El Servicio depende de APIs de terceros:</p>
          <ul>
            <li><strong>Google Calendar API</strong>: Interrupciones en Google afectarán el funcionamiento</li>
            <li><strong>WhatsApp Business API / WasenderAPI</strong>: Cambios en las políticas de WhatsApp pueden afectar la entrega de mensajes</li>
            <li><strong>Servicios de hosting</strong>: Problemas de infraestructura pueden causar inactividad temporal</li>
          </ul>
          <p>No somos responsables por interrupciones causadas por terceros.</p>
        </section>

        <section>
          <h2>7. Privacidad y Protección de Datos</h2>
          <p>
            El uso de sus datos está regido por nuestra{' '}
            <a href="/privacy">Política de Privacidad</a>. Al usar el Servicio, acepta dicha política.
          </p>
        </section>

        <section>
          <h2>8. Propiedad Intelectual</h2>
          <p>
            Todo el código, diseño, marcas y contenido del Servicio son propiedad de RecordAI o sus licenciantes. 
            Está prohibido:
          </p>
          <ul>
            <li>Copiar, modificar o distribuir el software sin autorización</li>
            <li>Realizar ingeniería inversa del servicio</li>
            <li>Usar nuestras marcas comerciales sin permiso explícito</li>
          </ul>
        </section>

        <section>
          <h2>9. Terminación del Servicio</h2>

          <h3>9.1 Por Parte del Usuario</h3>
          <p>Puede cancelar su cuenta en cualquier momento revocando el acceso a Google Calendar.</p>

          <h3>9.2 Por Nuestra Parte</h3>
          <p>Podemos suspender o terminar su acceso si:</p>
          <ul>
            <li>Viola estos Términos de Servicio</li>
            <li>Usa el servicio para actividades ilegales o fraudulentas</li>
            <li>Abusa del servicio enviando spam o contenido inapropiado</li>
            <li>No paga las tarifas del servicio (si aplica)</li>
          </ul>
        </section>

        <section>
          <h2>10. Modificaciones a los Términos</h2>
          <p>
            Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios significativos 
            serán notificados con al menos 30 días de anticipación por correo electrónico. El uso continuado del 
            Servicio después de los cambios constituye su aceptación.
          </p>
        </section>

        <section>
          <h2>11. Ley Aplicable y Jurisdicción</h2>
          <p>
            Estos términos se rigen por las leyes de Argentina. Cualquier disputa será resuelta en los tribunales 
            competentes de Argentina.
          </p>
        </section>

        <section>
          <h2>12. Indemnización</h2>
          <p>
            Usted acepta indemnizarnos y eximirnos de responsabilidad por cualquier reclamo, pérdida o daño 
            (incluidos honorarios legales) derivados de:
          </p>
          <ul>
            <li>Su uso del Servicio</li>
            <li>Violación de estos términos</li>
            <li>Violación de derechos de terceros (incluidos clientes que no consintieron recibir mensajes)</li>
            <li>Contenido de los mensajes enviados a través del Servicio</li>
          </ul>
        </section>

        <section>
          <h2>13. Divisibilidad</h2>
          <p>
            Si alguna disposición de estos términos se considera inválida o inaplicable, las disposiciones restantes 
            continuarán en pleno vigor y efecto.
          </p>
        </section>

        <section>
          <h2>14. Contacto y Soporte</h2>
          <p>Para preguntas, soporte técnico o asuntos legales, contáctenos:</p>
          <ul>
            <li><strong>Email de Soporte</strong>: support@recordai.app</li>
            <li><strong>Email Legal</strong>: legal@recordai.app</li>
            <li><strong>Sitio Web</strong>: https://recordai.app</li>
          </ul>
        </section>

        <footer className={styles.footer}>
          <p className={styles.confirmation}>
            Al usar RecordAI, confirma que ha leído, comprendido y aceptado estos Términos de Servicio en su totalidad.
          </p>
        </footer>
      </div>
    </div>
  );
}
