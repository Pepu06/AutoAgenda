/**
 * Converts a local date string + time string to a UTC Date object.
 * Uses the actual timezone offset at that moment, handling DST correctly.
 */
function localToUTC(dateStr, timeStr, timezone) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);

  // Create an estimate assuming the desired local values are UTC
  const estimate = new Date(Date.UTC(year, month - 1, day, hours, minutes));

  // Find what that UTC moment looks like in the target timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric',
    hour12: false,
  }).formatToParts(estimate);

  const get = type => parseInt(parts.find(p => p.type === type)?.value ?? 0);
  const localHour = get('hour') % 24; // handle "24" = 0
  const localMin  = get('minute');

  // Difference between desired and actual local time
  const diffMs = ((hours - localHour) * 60 + (minutes - localMin)) * 60 * 1000;
  return new Date(estimate.getTime() + diffMs);
}

/**
 * Returns the local date string (YYYY-MM-DD) for a given UTC Date in a timezone.
 */
function getLocalDateStr(date, timezone) {
  return date.toLocaleDateString('en-CA', { timeZone: timezone }); // "YYYY-MM-DD"
}

/**
 * Returns the day of week (0=Sunday…6=Saturday) for a UTC Date in a timezone.
 */
function getLocalDayOfWeek(date, timezone) {
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const short = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date);
  return weekdays.indexOf(short);
}

/**
 * Computes available booking slots.
 *
 * @param {Object} params
 * @param {Array}  params.rules         [{dayOfWeek, startTime, endTime}] (0=Sun..6=Sat)
 * @param {Array}  params.exceptions    [{date, isBlocked, startTime?, endTime?}] date as "YYYY-MM-DD"
 * @param {Array}  params.appointments  [{scheduledAt, durationMinutes}] scheduledAt as ISO string
 * @param {number} params.durationMinutes  Slot duration
 * @param {string} params.from          "YYYY-MM-DD" start date (inclusive)
 * @param {string} params.to            "YYYY-MM-DD" end date (inclusive)
 * @param {string} params.timezone      IANA timezone string
 * @param {number} [params.minHoursBeforeBooking=0]
 * @param {number} [params.maxConcurrentBookings=1]
 * @returns {string[]} Array of available slot times as ISO strings
 */
function computeAvailableSlots({
  rules,
  exceptions,
  appointments,
  durationMinutes,
  from,
  to,
  timezone,
  minHoursBeforeBooking = 0,
  maxConcurrentBookings = 1,
}) {
  const slots = [];
  const now = new Date();
  const minAheadMs = minHoursBeforeBooking * 60 * 60 * 1000;

  // Build exception map: date string -> exception object
  const exceptionMap = Object.fromEntries(exceptions.map(ex => [ex.date, ex]));

  // Group rules by dayOfWeek
  const rulesByDay = {};
  for (const rule of rules) {
    if (!rulesByDay[rule.dayOfWeek]) rulesByDay[rule.dayOfWeek] = [];
    rulesByDay[rule.dayOfWeek].push(rule);
  }

  // Iterate each day in the range (use noon UTC to avoid DST boundary issues)
  const fromDate = new Date(from + 'T12:00:00Z');
  const toDate   = new Date(to   + 'T12:00:00Z');

  for (let d = new Date(fromDate); d <= toDate; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    const localDateStr  = getLocalDateStr(d, timezone);
    const localDayOfWeek = getLocalDayOfWeek(d, timezone);

    const exception = exceptionMap[localDateStr];

    let dayRanges; // array of {startTime, endTime}
    if (exception) {
      if (exception.isBlocked) continue; // day fully blocked
      if (exception.startTime && exception.endTime) {
        dayRanges = [{ startTime: exception.startTime, endTime: exception.endTime }];
      } else {
        // "Disponible" exception with no custom hours → use regular rules
        dayRanges = rulesByDay[localDayOfWeek] || [];
      }
    } else {
      dayRanges = rulesByDay[localDayOfWeek] || [];
    }

    if (!dayRanges.length) continue;

    // Generate slots for each range in this day
    for (const range of dayRanges) {
      const rangeStart = localToUTC(localDateStr, range.startTime, timezone);
      const rangeEnd   = localToUTC(localDateStr, range.endTime, timezone);
      const slotMs     = durationMinutes * 60 * 1000;

      for (let slotStart = rangeStart.getTime(); slotStart + slotMs <= rangeEnd.getTime(); slotStart += slotMs) {
        const slotStartDate = new Date(slotStart);
        const slotEndDate   = new Date(slotStart + slotMs);

        // Skip slots in the past or within minHoursBeforeBooking
        if (slotStartDate.getTime() < now.getTime() + minAheadMs) continue;

        // Count overlapping appointments
        const overlapping = appointments.filter(apt => {
          const aptStart = new Date(apt.scheduledAt).getTime();
          const aptEnd   = aptStart + (apt.durationMinutes || durationMinutes) * 60 * 1000;
          // Overlap: aptStart < slotEnd AND aptEnd > slotStart
          return aptStart < slotEndDate.getTime() && aptEnd > slotStartDate.getTime();
        });

        if (overlapping.length < maxConcurrentBookings) {
          slots.push(slotStartDate.toISOString());
        }
      }
    }
  }

  return slots;
}

module.exports = { computeAvailableSlots, localToUTC, getLocalDateStr };
