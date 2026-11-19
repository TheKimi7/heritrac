// A date here is either a whole date or just a year, because that is how
// families remember them: everybody knows the year their grandfather was
// born and almost nobody knows the day.
//
// Stored as { year, month, day } with month and day left out when they are
// not known. Written and read as dd-mm-yyyy or yyyy.

export function parseDate(text) {
  if (text === null || text === undefined) return null;
  const raw = String(text).trim();
  if (!raw) return null;

  const whole = raw.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{3,4})$/);
  if (whole) {
    const day = Number(whole[1]);
    const month = Number(whole[2]);
    const year = Number(whole[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysIn(month, year)) return null;
    return { year, month, day };
  }

  // The other way round, which is what a date input gives you.
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysIn(month, year)) return null;
    return { year, month, day };
  }

  const yearOnly = raw.match(/^(\d{3,4})$/);
  if (yearOnly) return { year: Number(yearOnly[1]) };

  return null;
}

export function formatDate(d) {
  if (!d || typeof d.year !== "number") return "";
  if (!d.month || !d.day) return String(d.year);
  return pad(d.day) + "-" + pad(d.month) + "-" + d.year;
}

// A single number that sorts right whether or not the day is known. A date
// with no day sorts to the start of its year, which is the best guess
// available and never reorders two people born in different years.
export function dateKey(d) {
  if (!d || typeof d.year !== "number") return null;
  return d.year * 10000 + (d.month || 0) * 100 + (d.day || 0);
}

export function yearsBetween(from, to) {
  if (!from || typeof from.year !== "number" || !to || typeof to.year !== "number") return null;
  let years = to.year - from.year;
  if (from.month && from.day && to.month && to.day) {
    if (to.month < from.month || (to.month === from.month && to.day < from.day)) years -= 1;
  }
  return years;
}

export function today() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function daysIn(month, year) {
  return [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}
