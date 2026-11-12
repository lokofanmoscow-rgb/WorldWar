// Small shared helpers (no DOM here: the core must run headless in Node for simulation tests)

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Deterministic RNG (mulberry32) kept inside the game state so saves replay identically */
export function rnd(G) {
  let t = (G.seed = (G.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rndInt = (G, n) => Math.floor(rnd(G) * n);
export const pick = (G, arr) => arr[rndInt(G, arr.length)];

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const EPOCH = Date.UTC(1936, 0, 1);
const DAY_MS = 86400000;

/** day number (0 = 1 Jan 1936) -> {y,m,d} */
export function ymd(day) {
  const dt = new Date(EPOCH + day * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}
export function dayOf(y, m, d) {
  return Math.round((Date.UTC(y, m - 1, d || 1) - EPOCH) / DAY_MS);
}
export function fmtDate(day) {
  const t = ymd(day);
  return `${t.d} ${MONTHS[t.m]} ${t.y}`;
}
export function fmtDateShort(day) {
  const t = ymd(day);
  return `${t.d} ${MONTHS_SHORT[t.m]} ${t.y}`;
}
export const yearOf = (day) => ymd(day).y + ymd(day).m / 12;

export function fmtNum(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + ' млн';
  if (a >= 1e4) return Math.round(n / 1e3) + ' тыс';
  if (a >= 1e3) return (n / 1e3).toFixed(1) + ' тыс';
  if (a >= 100 || Number.isInteger(n)) return String(Math.round(n));
  return n.toFixed(1);
}
export const pct = (v, digits = 0) => (v * 100).toFixed(digits) + '%';
export const sgn = (v, digits = 0) => (v >= 0 ? '+' : '') + (digits ? v.toFixed(digits) : Math.round(v));
export const sgnPct = (v) => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';

export function sum(arr, f) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += f ? f(arr[i]) : arr[i];
  return s;
}
export function maxBy(arr, f) {
  let best = null, bv = -Infinity;
  for (const x of arr) {
    const v = f(x);
    if (v > bv) { bv = v; best = x; }
  }
  return best;
}
export function minBy(arr, f) {
  let best = null, bv = Infinity;
  for (const x of arr) {
    const v = f(x);
    if (v < bv) { bv = v; best = x; }
  }
  return best;
}
export const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
