function useHour12(timeFormat) {
  return timeFormat === '12h';
}

function formatTime(dateInput, { locale = 'es-AR', timeZone = 'America/Argentina/Buenos_Aires', timeFormat = '24h' } = {}) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return date.toLocaleTimeString(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: useHour12(timeFormat),
  });
}

function formatTemplateHour(dateInput, options = {}) {
  const timeFormat = options?.timeFormat || '24h';
  const base = formatTime(dateInput, options);
  if (timeFormat !== '24h') return base;
  if (/\bhs\.?$/i.test(base.trim())) return base;
  return `${base} hs.`;
}

module.exports = { useHour12, formatTime, formatTemplateHour };
