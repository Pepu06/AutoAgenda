# Política de Privacidad

**Última actualización:** Abril 2026

## Introducción

Recordatorios Consultorio Pedro ("nosotros", "nuestro" o "la aplicación") se compromete a proteger la privacidad de sus usuarios. Esta Política de Privacidad explica cómo accedemos, usamos, almacenamos y compartimos los datos obtenidos de su cuenta de Google Calendar.

## Información que Recopilamos

### Datos de Google Calendar

Mediante OAuth 2.0, nuestra aplicación solicita acceso de solo lectura a su Google Calendar para obtener:

- **Nombre del evento**: Título de la cita o evento
- **Fecha y hora**: Cuándo está programado el evento
- **Descripción del evento**: Información adicional que incluye el número de teléfono del cliente para enviar recordatorios

### Datos de Uso

También recopilamos información básica sobre el uso de la aplicación:

- Registros de envío de recordatorios (fecha, hora, estado)
- Información de autenticación (tokens de acceso de Google OAuth)
- Dirección de correo electrónico asociada a su cuenta de Google

## Cómo Usamos la Información

Los datos de Google Calendar son utilizados exclusivamente para:

1. **Leer eventos programados** en su calendario
2. **Extraer información de contacto** (números de teléfono) desde la descripción de los eventos
3. **Enviar recordatorios automáticos por WhatsApp** a los clientes antes de sus citas
4. **Mantener registros** de los mensajes enviados para seguimiento y auditoría

### Divulgación de Uso Limitado de Google

El uso que hace Recordatorios Consultorio Pedro de la información recibida de las APIs de Google cumple con la [Política de Datos de Usuario de los Servicios de API de Google](https://developers.google.com/terms/api-services-user-data-policy), incluidos los requisitos de Uso Limitado.

Específicamente:

- Solo accedemos a los datos **estrictamente necesarios** para proporcionar el servicio de recordatorios
- **No utilizamos** datos de Google para entrenar modelos de inteligencia artificial o machine learning
- **No transferimos** datos de Google a terceros, excepto cuando sea necesario para proporcionar el servicio (ej: API de WhatsApp)
- **No vendemos** datos de usuarios a terceros bajo ninguna circunstancia

## Cómo Almacenamos los Datos

- **Tokens de OAuth**: Se almacenan de forma segura y encriptada en nuestra base de datos
- **Eventos del calendario**: No se almacenan permanentemente; se leen solo cuando es necesario procesar recordatorios
- **Registros de mensajes**: Se guardan por hasta 90 días para fines de auditoría y luego se eliminan automáticamente
- **Números de teléfono**: Se extraen temporalmente de la descripción del evento y se utilizan únicamente para el envío del recordatorio

## Compartir Información con Terceros

### Proveedores de Servicios

Compartimos datos limitados con proveedores de servicios esenciales:

- **WhatsApp Business API / WasenderAPI**: Para enviar mensajes de recordatorio. Solo se comparte el número de teléfono y el mensaje personalizado.
- **Servicios de hosting**: Para alojar la aplicación de manera segura.

Estos proveedores tienen prohibido contractualmente usar los datos para cualquier otro propósito.

### No Vendemos Datos

**Nunca vendemos, alquilamos ni compartimos** su información personal o datos de Google Calendar con terceros con fines publicitarios o de marketing.

## Seguridad de los Datos

Implementamos medidas de seguridad técnicas y organizativas para proteger sus datos:

- Encriptación de datos en tránsito (HTTPS/TLS)
- Encriptación de tokens de acceso en reposo
- Acceso restringido solo a personal autorizado
- Auditorías regulares de seguridad

Sin embargo, ningún método de transmisión por Internet es 100% seguro. No podemos garantizar la seguridad absoluta de los datos.

## Sus Derechos y Controles

Usted tiene derecho a:

- **Revocar el acceso** a su Google Calendar en cualquier momento desde la [página de permisos de Google](https://myaccount.google.com/permissions)
- **Solicitar la eliminación** de todos sus datos contactándonos directamente
- **Exportar sus datos** en formato legible
- **Actualizar o corregir** información incorrecta

## Retención de Datos

- **Tokens de OAuth**: Se mantienen mientras su cuenta esté activa
- **Registros de mensajes**: Se eliminan automáticamente después de 90 días
- **Datos del calendario**: No se retienen; se consultan bajo demanda

Al revocar el acceso o eliminar su cuenta, todos los datos asociados se eliminan en un plazo de 30 días.

## Cumplimiento Legal

Podemos divulgar información personal si:

- Es requerido por ley (orden judicial, citación)
- Es necesario para proteger nuestros derechos legales
- Es necesario para prevenir fraude o abuso

## Cambios a esta Política

Nos reservamos el derecho de modificar esta Política de Privacidad. Los cambios significativos serán notificados por correo electrónico y se publicarán con al menos 30 días de anticipación.

## Contacto

Si tiene preguntas sobre esta Política de Privacidad o desea ejercer sus derechos, contáctenos en:

- **Email**: [su-email@ejemplo.com]
- **Sitio web**: [su-sitio-web.com]

---

**Esta Política de Privacidad cumple con:**
- Política de Datos de Usuario de los Servicios de API de Google
- Requisitos de Uso Limitado de Google OAuth
- Reglamento General de Protección de Datos (GDPR) donde aplique
