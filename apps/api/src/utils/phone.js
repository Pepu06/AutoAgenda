function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Normaliza teléfonos argentinos al formato E.164 (+549...).
 * Devuelve null si no puede normalizar.
 */
function normalizePhone(raw = '') {
  const digits = onlyDigits(raw);
  if (!digits) return null;

  // +54 9 <área> <abonado>
  if (digits.startsWith('549') && digits.length >= 12) {
    return `+${digits}`;
  }

  // 54 <área> <abonado> (falta 9 móvil)
  if (digits.startsWith('54') && digits.length >= 11) {
    return `+549${digits.slice(2)}`;
  }

  // 9 <área> <abonado>
  if (digits.startsWith('9') && digits.length >= 11) {
    return `+54${digits}`;
  }

  // <área> <abonado>
  if (digits.length === 10) {
    return `+549${digits}`;
  }

  // Solo abonado (asume área 11)
  if (digits.length === 8) {
    return `+54911${digits}`;
  }

  const last8 = digits.slice(-8);
  return last8.length === 8 ? `+54911${last8}` : null;
}

module.exports = { onlyDigits, normalizePhone };