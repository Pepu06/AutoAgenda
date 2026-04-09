/**
 * Tour step definitions.
 *
 * Each step:
 *   id        — unique key (stored in localStorage)
 *   route     — path the tour navigates to before showing this step (null = no navigation)
 *   selector  — CSS selector of the highlighted element (null = centered modal, no highlight)
 *   position  — preferred popover placement: 'bottom' | 'top' | 'left' | 'right' | 'center'
 *   title     — step heading
 *   text      — step body (plain text or short HTML)
 *   canSkip   — if true show a "Saltar paso" button (default true)
 *   waitText  — text shown on "Siguiente" while waiting for a condition (optional)
 */
const STEPS = [
  {
    id: 'welcome',
    route: null,
    selector: null,
    position: 'center',
    title: '¡Bienvenido a AutoAgenda! 🎉',
    text: 'Vamos a configurar todo lo necesario para que puedas empezar a usar la plataforma. El tour toma unos minutos y te lleva de la mano por cada sección.',
    canSkip: false,
  },

  // ── Settings ──────────────────────────────────────────
  {
    id: 'settings-nav',
    route: '/settings',
    selector: '[data-tour="nav-settings"]',
    position: 'right',
    title: 'Configuración',
    text: 'Acá configurás todo lo relacionado con tu negocio: nombre, mensajes, recordatorios y más. Hacé click en "Siguiente" para recorrer cada sección.',
    canSkip: false,
  },
  {
    id: 'settings-general',
    route: '/settings',
    selector: '[data-tour="settings-general"]',
    position: 'bottom',
    title: '1 / 6 — General',
    text: 'Completá el nombre de tu negocio y el huso horario. El nombre aparece en el encabezado del recordatorio que reciben tus clientes.',
    canSkip: true,
  },
  {
    id: 'settings-mensaje',
    route: '/settings',
    selector: '[data-tour="settings-mensaje"]',
    position: 'top',
    title: '2 / 6 — Mensaje personalizable',
    text: 'Este es el texto que verán tus clientes en el recordatorio de WhatsApp. Personalizalo con instrucciones, links o información extra.',
    canSkip: true,
  },
  {
    id: 'settings-respuestas',
    route: '/settings',
    selector: '[data-tour="settings-respuestas"]',
    position: 'top',
    title: '3 / 6 — Respuestas automáticas',
    text: 'Configurá los mensajes que el bot envía automáticamente cuando el cliente confirma o cancela su turno.',
    canSkip: true,
  },
  {
    id: 'settings-recordatorios',
    route: '/settings',
    selector: '[data-tour="settings-recordatorios"]',
    position: 'top',
    title: '4 / 6 — Recordatorios',
    text: 'Elegí con cuánta anticipación se envía el recordatorio automático y a qué hora. Recomendamos 24 hs antes.',
    canSkip: true,
  },
  {
    id: 'settings-bot-admin',
    route: '/settings',
    selector: '[data-tour="settings-bot-admin"]',
    position: 'top',
    title: '5 / 6 — Alertas para el administrador',
    text: 'Activá las alertas para recibir un WhatsApp cada vez que un cliente agenda, confirma o cancela un turno.',
    canSkip: true,
  },
  {
    id: 'settings-ubicacion',
    route: '/settings',
    selector: '[data-tour="settings-ubicacion"]',
    position: 'top',
    title: '6 / 6 — Ubicación',
    text: 'Indicá la dirección de tu negocio. Aparecerá en el recordatorio al cliente como variable {{ubicacion}}.',
    canSkip: true,
  },

  // ── Google Calendar ───────────────────────────────────
  {
    id: 'gcal-connect',
    route: '/calendar',
    selector: '[data-tour="gcal-connect"]',
    position: 'bottom',
    title: 'Google Calendar',
    text: 'Si todavía no conectaste tu cuenta de Google, hacé click en "Conectar Google Calendar". Si ya está conectado (ves los botones de sincronizar y desconectar), podés pasar al siguiente paso.',
    canSkip: true,
  },
  {
    id: 'gcal-default',
    route: '/calendar',
    selector: '[data-tour="gcal-default"]',
    position: 'bottom',
    title: 'Calendario predeterminado',
    text: 'Una vez conectado, aparece este selector. Elegí en cuál de tus calendarios de Google querés que se creen las citas automáticamente. Si solo tenés uno, ya está configurado.',
    canSkip: true,
  },

  // ── TuAutoAgenda ──────────────────────────────────────
  {
    id: 'autoagenda-nav',
    route: '/tu-autoagenda',
    selector: '[data-tour="nav-tu-autoagenda"]',
    position: 'right',
    title: 'TuAutoAgenda',
    text: 'Desde acá configurás tu página pública de reservas. Tus clientes podrán agendar citas por sí mismos con un simple link.',
    canSkip: false,
  },
  {
    id: 'schedule',
    route: '/tu-autoagenda',
    selector: '[data-tour="schedule-btn"]',
    position: 'bottom',
    title: 'Crear un horario',
    text: 'Primero creá un horario de disponibilidad (ej: Lunes a Viernes 9 hs – 18 hs). Podés tener varios horarios distintos.',
    canSkip: true,
  },
  {
    id: 'type',
    route: '/tu-autoagenda',
    selector: '[data-tour="type-btn"]',
    position: 'bottom',
    title: 'Crear un tipo de cita',
    text: 'Después creá los tipos de cita que ofrecés (ej: "Consulta inicial — 30 min"). Cada tipo se asocia a un horario y puede tener descripción, precio y preguntas extras.',
    canSkip: true,
  },
  {
    id: 'publish',
    route: '/tu-autoagenda',
    selector: '[data-tour="publish-form"]',
    position: 'top',
    title: 'Publicar tu autoagenda',
    text: 'Elegí una URL única para tu página (ej: autoagenda.online/book/tu-negocio), activá el toggle y guardá. ¡Listo para compartir!',
    canSkip: true,
  },

  // ── Done ─────────────────────────────────────────────
  {
    id: 'done',
    route: null,
    selector: null,
    position: 'center',
    title: '¡Todo configurado! 🚀',
    text: '¡Excelente! Ya tenés todo listo para empezar a recibir reservas. Recordá compartir tu link de autoagenda con tus clientes.',
    canSkip: false,
  },
];

export default STEPS;
