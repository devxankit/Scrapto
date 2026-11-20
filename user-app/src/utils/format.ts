/** ₹1,24,500 (Indian grouping). Paise shown only when they matter. */
export function inr(n: number | null | undefined, paise = false): string {
  const v = Number(n ?? 0);
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: paise && !whole ? 2 : 0, maximumFractionDigits: paise ? 2 : 0 })}`;
}

/** 12.5 kg · 1 pc */
export function qty(n: number, unit: 'kg' | 'pc' = 'kg'): string {
  const v = Math.round(n * 10) / 10;
  return unit === 'pc' ? `${v} ${v === 1 ? 'pc' : 'pcs'}` : `${v} kg`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Nov" (this year) or "12 Nov 2025". */
export function dateLabel(iso?: string | number | Date | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const s = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? s : `${s} ${d.getFullYear()}`;
}

export function timeLabel(iso?: string | number | Date | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${((h + 11) % 12) + 1}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Today, 4:30 PM" / "Yesterday, 9:05 AM" / "12 Nov, 4:30 PM" */
export function whenLabel(iso?: string | number | Date | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today.getTime() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = same(d, today) ? 'Today' : same(d, y) ? 'Yesterday' : dateLabel(d);
  return `${day}, ${timeLabel(d)}`;
}

/** "5m", "3h", "2d" */
export function ago(iso?: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return dateLabel(iso);
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** "98765 43210" */
export function phoneLabel(p?: string): string {
  const d = (p ?? '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

export const firstName = (n?: string) => (n ?? '').trim().split(/\s+/)[0] ?? '';

/** Next 7 days for the pickup date picker: [{ key, day, date, label }] */
export function nextDays(n = 7) {
  const out: { key: string; day: string; date: number; month: string; label: string }[] = [];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() + i * 86400000);
    out.push({ key: d.toISOString().slice(0, 10), day: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : DAYS[d.getDay()], date: d.getDate(), month: MONTHS[d.getMonth()], label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}` });
  }
  return out;
}

const UPPER_WORDS = new Set(['ac', 'tv', 'led', 'lcd', 'cpu', 'ups', 'pc']);
/** Display name for a scrap category stored in lowercase ("split ac" -> "Split AC"). */
export const catName = (c?: string | null) =>
  (c ?? '').replace(/[a-z0-9]+/gi, (w) => (UPPER_WORDS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)));
