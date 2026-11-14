// DOM helpers, icons and flag images.
import { COUNTRIES } from '../data/countries.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Original line icons (24x24 grid)
const P = {
  pp: '<path d="M5 21V4"/><path d="M5 5c4-2 6 2 10 0l3-1v9l-3 1c-4 2-6-2-10 0"/>',
  stab: '<path d="M12 4v16M6 20h12M4 8h16"/><path d="M4 8l-2 6a3 3 0 006 0zM20 8l-2 6a3 3 0 006 0z" transform="translate(-1 0) scale(.96)"/>',
  ws: '<path d="M4 4l12 12M20 4L8 16M14 18l4-4M6 14l4 4M17 17l3 3M7 17l-3 3"/>',
  mp: '<circle cx="9" cy="7" r="3"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6"/><circle cx="17" cy="9" r="2.3"/><path d="M16 14c3 0 5 2 5 5"/>',
  civ: '<path d="M3 21V11l5 3v-3l5 3V5h4l2 16z"/><path d="M7 18h2M12 18h2"/>',
  mil: '<path d="M3 21V11l5 3v-3l5 3V5h4l2 16z"/><path d="M11 17.5l1.2 2.3 2.6.3-1.9 1.7"/><path d="M8 18l3-1"/>',
  dock: '<circle cx="12" cy="5" r="2"/><path d="M12 7v13M7 11h10M4 14c0 4 4 6 8 6s8-2 8-6"/>',
  ship: '<path d="M3 16l2 4h14l2-4zM6 16V9h7l4 7M9 9V5h3"/>',
  tension: '<circle cx="12" cy="12" r="9"/><path d="M12 3l-2 6 4 3-3 4 1 5"/>',
  oil: '<path d="M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z"/>',
  steel: '<path d="M4 8l4-3h12l-4 3zM4 8v8l12 0 4-3V5M16 8v8"/>',
  alu: '<path d="M12 3l9 16H3z"/><path d="M12 9v5M12 16.5v.5"/>',
  rub: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/>',
  tun: '<path d="M12 3l7 9-7 9-7-9z"/><path d="M5 12h14"/>',
  chr: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>',
  research: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/><path d="M7.5 15h9"/>',
  focus: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>',
  build: '<path d="M4 21h16M6 21V8l6-4 6 4v13M10 21v-6h4v6M9 11h6"/>',
  prod: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  army: '<path d="M4 13a8 8 0 0116 0v2H4z"/><path d="M4 15l-1 4h18l-1-4M12 5V3"/>',
  air: '<path d="M12 3c1 0 1.5 1 1.5 3v4l7.5 5v2l-7.5-2.5V19l2.5 2v1L12 21l-4 1v-1l2.5-2v-4.5L3 17v-2l7.5-5V6c0-2 .5-3 1.5-3z"/>',
  navy: '<circle cx="12" cy="5" r="2"/><path d="M12 7v13M7 11h10M4 14c0 4 4 6 8 6s8-2 8-6"/>',
  diplo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  country: '<path d="M4 21V4h11l-2 4 2 4H4"/>',
  log: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.5M4 12h.5M4 18h.5"/>',
  trade: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  save: '<path d="M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  pause: '<path d="M7 4v16M17 4v16" stroke-width="3.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  expand: '<path d="M7 14l5-5 5 5"/>',
  collapse: '<path d="M7 10l5 5 5-5"/>',
  home: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.500l1.2-6L3.300 9.300l6.100-.7z"/>',
  warn: '<path d="M12 3l10 18H2zM12 10v5M12 17.500v.5"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  auto: '<path d="M4 12a8 8 0 0113.500-5.800L20 8M20 4v4h-4M20 12a8 8 0 01-13.500 5.800L4 16M4 20v-4h4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.600 2.600 0 115 1c0 1.500-2.500 2-2.500 3.500M12 17.500v.5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  bolt: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  skull: '<path d="M12 3a8 8 0 00-5 14v3h10v-3a8 8 0 00-5-14z"/><circle cx="9" cy="12" r="1.500"/><circle cx="15" cy="12" r="1.500"/><path d="M10.500 20v-2M13.500 20v-2"/>',
  speed: '<path d="M4 5l8 7-8 7zM12 5l8 7-8 7z" fill="currentColor"/>',
  nuke: '<circle cx="12" cy="12" r="2"/><path d="M12 10V3a9 9 0 00-7.800 4.500zM13.700 13l6.100 3.500A9 9 0 0020 7.500zM10.300 13l-6.100 3.500A9 9 0 0012 21z"/>',
  fort: '<path d="M4 21V8h3V5h3v3h4V5h3v3h3v13zM10 21v-5h4v5"/>',
  supply: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.100-1.300l2-1.500-2-3.400-2.300.9a7 7 0 00-2.300-1.300L14 3h-4l-.300 2.400a7 7 0 00-2.300 1.300l-2.300-.9-2 3.400 2 1.500a7 7 0 000 2.600l-2 1.500 2 3.400 2.300-.9a7 7 0 002.300 1.300L10 21h4l.300-2.400a7 7 0 002.300-1.300l2.300.9 2-3.400-2-1.500c.100-.400.100-.900.100-1.300z"/>',
};
export function ic(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24">${P[name] || P.more}</svg>`;
}

// ---- flags ---------------------------------------------------------------------------------------
function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}
/** draw a flag from its spec string (see data/countries.js) */
export function drawFlag(ctx, spec, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const parts = spec.split(';');
  for (const part of parts) {
    const k = part[0];
    const [colsRaw, argRaw] = part.slice(2).split('@');
    const a = argRaw ? argRaw.split(',').map(Number) : [];
    if (k === 'h' || k === 'v') {
      const cols = colsRaw.split(',');
      cols.forEach((c, i) => {
        ctx.fillStyle = c;
        if (k === 'h') ctx.fillRect(x, y + (h * i) / cols.length, w, h / cols.length + 0.6);
        else ctx.fillRect(x + (w * i) / cols.length, y, w / cols.length + 0.6, h);
      });
      continue;
    }
    ctx.fillStyle = colsRaw; ctx.strokeStyle = colsRaw;
    if (k === 'c') { ctx.beginPath(); ctx.arc(x + a[0] * w, y + a[1] * h, a[2] * h, 0, 6.3); ctx.fill(); }
    else if (k === 's') star(ctx, x + a[0] * w, y + a[1] * h, a[2] * h * 1.3);
    else if (k === 'r') ctx.fillRect(x + a[0] * w, y + a[1] * h, a[2] * w, a[3] * h);
    else if (k === 'x') { const t = 0.2 * h * (a[0] || 1); ctx.fillRect(x + 0.36 * w - t / 2, y, t, h); ctx.fillRect(x, y + h / 2 - t / 2, w, t); }
    else if (k === '+') { const t = (a[0] || 0.2) * h; const px = (a[1] || 0.5) * w; ctx.fillRect(x + px - t / 2, y, t, h); ctx.fillRect(x, y + h / 2 - t / 2, w, t); }
    else if (k === 'd') { ctx.lineWidth = (a[0] || 0.15) * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke(); }
    else if (k === 't') { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.45, y + h / 2); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill(); }
  }
  ctx.restore();
}
const flagCache = {};
export function flagURL(tag) {
  if (flagCache[tag]) return flagCache[tag];
  const cv = document.createElement('canvas');
  cv.width = 60; cv.height = 40;
  const d = COUNTRIES[tag];
  if (d && d.flag) drawFlag(cv.getContext('2d'), d.flag, 0, 0, 60, 40);
  return (flagCache[tag] = cv.toDataURL());
}
export const flag = (tag) => `<img class="flag" src="${flagURL(tag)}" alt="">`;

export function bar(v, cls = '') {
  return `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, v * 100)).toFixed(1)}%"></i></div>`;
}
export function stepper(val, actDown, actUp, disDown, disUp) {
  return `<span class="step"><button data-a="${actDown}" class="${disDown ? 'dis' : ''}">−</button><span>${val}</span><button data-a="${actUp}" class="${disUp ? 'dis' : ''}">+</button></span>`;
}
export function sw(on, act) { return `<button class="sw ${on ? 'on' : ''}" data-a="${act}"></button>`; }
export function btn(label, act, cls = '', dis = false) {
  return `<button class="btn ${cls} ${dis ? 'dis' : ''}" data-a="${act}">${label}</button>`;
}
