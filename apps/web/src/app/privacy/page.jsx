import styles from './privacy.module.css';

export const metadata = {
  title: 'Política de Privacidad - RecordAI',
  description: 'Política de privacidad y uso de datos de RecordAI',
};

export default function PrivacyPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1>Política de Privacidad</h1>
        <p className={styles.updated}>Última actualización: Abril 2026</p>

        <section>
          <h2>Introducción</h2>
          <p>
            RecordAI ("nosotros", "nuestro" o "la aplicación") se compromete a proteger la privacidad de sus usuarios. 
            Esta Política de Privacidad explica cómo accedemos, usamos, almacenamos y compartimos los datos obtenidos 
            de su cuenta de Google Calendar.
          </p>
        </section>

        <section>
          <h2>Información que Recopilamos</h2>
          
          <h3>Datos de Google Calendar</h3>
          <p>Mediante OAuth 2.0, nuestra aplicación solicita acceso de solo lectura a su Google Calendar para obtener:</p>
          <ul>
            <li><strong>Nombre del evento</strong>: Título de la cita o evento</li>
            <li><strong>Fecha y hora</strong>: Cuándo está programado el evento</li>
            <li><strong>Descripción del evento</strong>: Información adicional que incluye el número de teléfono del cliente para enviar recordatorios</li>
          </ul>

          <h3>Datos de Uso</h3>
          <p>También recopilamos información básica sobre el uso de la aplicación:</p>
          <ul>
            <li>Registros de envío de recordatorios (fecha, hora, estado)</li>
            <li>Información de autenticación (tokens de acceso de Google OAuth)</li>
            <li>Dirección de correo electrónico asociada a su cuenta de Google</li>
          </ul>
        </section>

        <section>
          <h2>Cómo Usamos la Información</h2>
          <p>Los datos de Google Calendar son utilizados exclusivamente para:</p>
          <ol>
            <li><strong>Leer eventos programados</strong> en su calendario</li>
            <li><strong>Extraer información de contacto</strong> (números de teléfono) desde la descripción de los eventos</li>
            <li><strong>Enviar recordatorios automáticos por WhatsApp</strong> a los clientes antes de sus citas</li>
            <li><strong>Mantener registros</strong> de los mensajes enviados para seguimiento y auditoría</li>
          </ol>

          <h3>Divulgación de Uso Limitado de Google</h3>
          <p>
            El uso que hace RecordAI de la información recibida de las APIs de Google cumple con la{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              Política de Datos de Usuario de los Servicios de API de Google
            </a>, incluidos los requisitos de Uso Limitado.
          </p>
          <p>Específicamente:</p>
          <ul>
            <li>Solo accedemos a los datos <strong>estrictamente necesarios</strong> para proporcionar el servicio de recordatorios</li>
            <li><strong>No utilizamos</strong> datos de Google para entrenar modelos de inteligencia artificial o machine learning</li>
            <li><strong>No transferimos</strong> datos de Google a terceros, excepto cuando sea necesario para proporcionar el servicio (ej: API de WhatsApp)</li>
            <li><strong>No vendemos</strong> datos de usuarios a terceros bajo ninguna circunstancia</li>
          </ul>
        </section>

        <section>
          <h2>Cómo Almacenamos los Datos</h2>
          <ul>
            <li><strong>Tokens de OAuth</strong>: Se almacenan de forma segura y encriptada en nuestra base de datos</li>
            <li><strong>Eventos del calendario</strong>: No se almacenan permanentemente; se leen solo cuando es necesario procesar recordatorios</li>
            <li><strong>Registros de mensajes</strong>: Se guardan por hasta 90 días para fines de auditoría y luego se eliminan automáticamente</li>
            <li><strong>Números de teléfono</strong>: Se extraen temporalmente de la descripción del evento y se utilizan únicamente para el envío del recordatorio</li>
          </ul>
        </section>

        <section>
          <h2>Compartir Información con Terceros</h2>
          
          <h3>Proveedores de Servicios</h3>
          <p>Compartimos datos limitados con proveedores de servicios esenciales:</p>
          <ul>
            <li><strong>WhatsApp Business API / WasenderAPI</strong>: Para enviar mensajes de recordatorio. Solo se comparte el número de teléfono y el mensaje personalizado.</li>
            <li><strong>Servicios de hosting</strong>: Para alojar la aplicación de manera segura.</li>
          </ul>
          <p>Estos proveedores tienen prohibido contractualmente usar los datos para cualquier otro propósito.</p>

          <h3>No Vendemos Datos</h3>
          <p className={styles.highlight}>
            <strong>Nunca vendemos, alquilamos ni compartimos</strong> su información personal o datos de Google Calendar 
            con terceros con fines publicitarios o de marketing.
          </p>
        </section>

        <section>
          <h2>Seguridad de los Datos</h2>
          <p>Implementamos medidas de seguridad técnicas y organizativas para proteger sus datos:</p>
          <ul>
            <li>Encriptación de datos en tránsito (HTTPS/TLS)</li>
            <li>Encriptación de tokens de acceso en reposo</li>
            <li>Acceso restringido solo a personal autorizado</li>
            <li>Auditorías regulares de seguridad</li>
          </ul>
          <p>Sin embargo, ningún método de transmisión por Internet es 100% seguro. No podemos garantizar la seguridad absoluta de los datos.</p>
        </section>

        <section>
          <h2>Sus Derechos y Controles</h2>
          <p>Usted tiene derecho a:</p>
          <ul>
            <li>
              <strong>Revocar el acceso</strong> a su Google Calendar en cualquier momento desde la{' '}
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
                página de permisos de Google
              </a>
            </li>
            <li><strong>Solicitar la eliminación</strong> de todos sus datos contactándonos directamente</li>
            <li><strong>Exportar sus datos</strong> en formato legible</li>
            <li><strong>Actualizar o corregir</strong> información incorrecta</li>
          </ul>
        </section>

        <section>
          <h2>Retención de Datos</h2>
          <ul>
            <li><strong>Tokens de OAuth</strong>: Se mantienen mientras su cuenta esté activa</li>
            <li><strong>Registros de mensajes</strong>: Se eliminan automáticamente después de 90 días</li>
            <li><strong>Datos del calendario</strong>: No se retienen; se consultan bajo demanda</li>
          </ul>
          <p>Al revocar el acceso o eliminar su cuenta, todos los datos asociados se eliminan en un plazo de 30 días.</p>
        </section>

        <section>
          <h2>Cumplimiento Legal</h2>
          <p>Podemos divulgar información personal si:</p>
          <ul>
            <li>Es requerido por ley (orden judicial, citación)</li>
            <li>Es necesario para proteger nuestros derechos legales</li>
            <li>Es necesario para prevenir fraude o abuso</li>
          </ul>
        </section>

        <section>
          <h2>Cambios a esta Política</h2>
          <p>
            Nos reservamos el derecho de modificar esta Política de Privacidad. Los cambios significativos serán 
            notificados por correo electrónico y se publicarán con al menos 30 días de anticipación.
          </p>
        </section>

        <section>
          <h2>Contacto</h2>
          <p>Si tiene preguntas sobre esta Política de Privacidad o desea ejercer sus derechos, contáctenos en:</p>
          <ul>
            <li><strong>Email</strong>: privacy@recordai.app</li>
            <li><strong>Sitio web</strong>: https://recordai.app</li>
          </ul>
        </section>

        <footer className={styles.footer}>
          <p>
            <strong>Esta Política de Privacidad cumple con:</strong>
          </p>
          <ul>
            <li>Política de Datos de Usuario de los Servicios de API de Google</li>
            <li>Requisitos de Uso Limitado de Google OAuth</li>
            <li>Reglamento General de Protección de Datos (GDPR) donde aplique</li>
          </ul>
        </footer>
      </div>
    </div>
  );
}
