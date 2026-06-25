function formatTime(dateInput, { locale = 'es-AR', timeZone = 'America/Argentina/Buenos_Aires', timeFormat = '24h' } = {}) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return date.toLocaleTimeString(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  });
}

function formatTemplateHour(dateInput, options = {}) {
  const timeFormat = options?.timeFormat || '24h';
  const base = formatTime(dateInput, options);
  if (timeFormat !== '24h') return base;
  if (/\bhs\.?$/i.test(base.trim())) return base;
  return `${base} hs`;
}

module.exports = { formatTime, formatTemplateHour };
