// Canvas map: regions, borders, labels, unit counters, fleets; pan / pinch-zoom / tap input.
import { REG, NREG, SEA, ARCS, ARCS_LO, ARC_OWNER, LAKES, RIVERS, MAP_W, MAP_H, TERRAIN, regionAtXY, seaAtXY, regionRings, regionsInRange } from '../core/world.js';
import { COUNTRIES } from '../data/countries.js';
import { atWar, friendly, sameSide, opinion, enemies } from '../core/diplo.js';
import { divsIn } from '../core/land.js';
import { regionSupplyCap } from '../core/supply.js';
import { planeRange } from '../core/air.js';
import { fleetSize } from '../core/navy.js';
import { RES } from '../data/equip.js';
import { clamp } from '../core/util.js';

const SEA_COL = '#a9c6d2', PAPER = [239, 230, 208];
const LOD_SWITCH = 0.075;
export const MODES = { pol: 'Политическая', ter: 'Рельеф', ind: 'Промышленность', sup: 'Снабжение', dip: 'Дипломатия', air: 'Авиация', nav: 'Флот' };

function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
const css = (c, a = 1) => (a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

function ringsPath(rings) {
  const p = new Path2D();
  for (const poly of rings) for (const ring of poly) {
    p.moveTo(ring[0], ring[1]);
    for (let i = 2; i < ring.length; i += 2) p.lineTo(ring[i], ring[i + 1]);
    p.closePath();
  }
  return p;
}
function arcInto(p, a) {
  p.moveTo(a[0], a[1]);
  for (let i = 2; i < a.length; i += 2) p.lineTo(a[i], a[i + 1]);
}
function flatPath(list, close) {
  const p = new Path2D();
  for (const a of list) { arcInto(p, a); if (close) p.closePath(); }
  return p;
}

export class MapView {
  constructor(canvas, hooks) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.cam = { x: MAP_W * 0.53, y: MAP_H * 0.32, s: 0.05 };
    this.mode = 'pol';
    this.G = null;
    this.sel = { region: -1, sea: -1, divs: new Set(), fleet: null, wing: null };
    this.pick = null;             // { valid(i) } highlights candidate regions
    this.hits = [];
    this.dirty = true;
    this.pathCache = [new Array(NREG), new Array(NREG)];
    this.seaPaths = SEA.map((s) => { const p = new Path2D(); for (const poly of s.polys) for (const ring of poly) { p.moveTo(ring[0], ring[1]); for (let i = 2; i < ring.length; i += 2) p.lineTo(ring[i], ring[i + 1]); p.closePath(); } return p; });
    this.lakePath = flatPath(LAKES, true);
    this.riverPath = flatPath(RIVERS, false);
    this.coast = [null, null];
    for (let lod = 0; lod < 2; lod++) {
      const arcs = lod ? ARCS_LO : ARCS;
      const p = new Path2D();
      ARC_OWNER.forEach((o, i) => { if (o[1] < 0) arcInto(p, arcs[i]); });
      this.coast[lod] = p;
    }
    this.borders = null; this.borderKey = '';
    this.colCache = {};
    this.hatch = null;
    this.pointers = new Map();
    this.bind();
    this.resize();
    const loop = () => { if (this.dirty || this.vel) this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---- geometry ----
  resize() {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const r = this.cv.getBoundingClientRect();
    this.w = Math.max(50, r.width); this.h = Math.max(50, r.height); this.dpr = dpr;
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.minS = Math.max(this.w / MAP_W, this.h / MAP_H / 1.6) * 0.98;
    this.clampCam();
    this.dirty = true;
  }
  clampCam() {
    const c = this.cam;
    c.s = clamp(c.s, this.minS, 1.1);
    const hw = this.w / 2 / c.s, hh = this.h / 2 / c.s;
    c.x = hw >= MAP_W / 2 ? MAP_W / 2 : clamp(c.x, hw, MAP_W - hw);
    c.y = hh >= MAP_H / 2 ? MAP_H / 2 : clamp(c.y, hh - 300, MAP_H - hh + 300);
  }
  toScreen(mx, my) { return [(mx - this.cam.x) * this.cam.s + this.w / 2, (my - this.cam.y) * this.cam.s + this.h / 2]; }
  toMap(sx, sy) { return [(sx - this.w / 2) / this.cam.s + this.cam.x, (sy - this.h / 2) / this.cam.s + this.cam.y]; }
  centerOn(region, scale) {
    const R = REG[region];
    this.cam.x = R.c[0]; this.cam.y = R.c[1];
    if (scale) this.cam.s = scale;
    this.clampCam(); this.dirty = true;
  }
  /** show a set of regions (e.g. a whole country) */
  fitRegions(ids, pad = 1.25) {
    if (!ids.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const i of ids) { const b = REG[i].bb; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    this.cam.x = (x0 + x1) / 2; this.cam.y = (y0 + y1) / 2;
    this.cam.s = Math.min(this.w / ((x1 - x0) * pad), (this.h * 0.6) / ((y1 - y0) * pad), 0.35);
    this.clampCam(); this.dirty = true;
  }
  zoomBy(f, sx = this.w / 2, sy = this.h / 2) {
    const [mx, my] = this.toMap(sx, sy);
    this.cam.s = clamp(this.cam.s * f, this.minS, 1.1);
    this.cam.x = mx - (sx - this.w / 2) / this.cam.s; this.cam.y = my - (sy - this.h / 2) / this.cam.s;
    this.clampCam(); this.dirty = true;
  }
  invalidate(borders) { this.dirty = true; if (borders) this.borderKey = ''; }
  // helpers for automated UI tests
  __adj(r) { return REG[r].adj; }
  __c(r) { return REG[r].c; }

  // ---- input ----
  bind() {
    const cv = this.cv;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      this.pointers.set(e.pointerId, { x, y });
      this.vel = null;
      if (this.pointers.size === 1) {
        this.drag = { x0: x, y0: y, t0: performance.now(), moved: false, lx: x, ly: y, lt: performance.now(), vx: 0, vy: 0 };
        clearTimeout(this.longT);
        this.longT = setTimeout(() => { if (this.drag && !this.drag.moved && this.pointers.size === 1) { this.drag.long = true; this.tap(this.drag.x0, this.drag.y0, true); } }, 520);
      } else if (this.pointers.size === 2) {
        clearTimeout(this.longT);
        const p = Array.from(this.pointers.values());
        this.pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2 };
        if (this.drag) this.drag.moved = true;
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const pt = this.pointers.get(e.pointerId);
      if (!pt) return;
      const [x, y] = pos(e);
      if (this.pointers.size === 1 && this.drag) {
        const d = this.drag;
        if (!d.moved && Math.hypot(x - d.x0, y - d.y0) > 8) { d.moved = true; clearTimeout(this.longT); }
        if (d.moved) {
          this.cam.x -= (x - pt.x) / this.cam.s; this.cam.y -= (y - pt.y) / this.cam.s;
          const now = performance.now(), dt = Math.max(1, now - d.lt);
          d.vx = 0.6 * d.vx + 0.4 * ((x - d.lx) / dt); d.vy = 0.6 * d.vy + 0.4 * ((y - d.ly) / dt);
          d.lx = x; d.ly = y; d.lt = now;
          this.clampCam(); this.dirty = true;
        }
      }
      pt.x = x; pt.y = y;
      if (this.pointers.size === 2 && this.pinch) {
        const p = Array.from(this.pointers.values());
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2;
        const [mx, my] = this.toMap(this.pinch.cx, this.pinch.cy);
        this.cam.s = clamp((this.cam.s * d) / Math.max(1, this.pinch.d), this.minS, 1.1);
        this.cam.x = mx - (cx - this.w / 2) / this.cam.s; this.cam.y = my - (cy - this.h / 2) / this.cam.s;
        this.pinch.d = d; this.pinch.cx = cx; this.pinch.cy = cy;
        this.clampCam(); this.dirty = true;
      }
    });
    const up = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      clearTimeout(this.longT);
      if (this.pointers.size === 0 && this.drag) {
        const d = this.drag;
        this.drag = null; this.pinch = null;
        if (!d.moved && !d.long && e.type === 'pointerup') this.tap(d.x0, d.y0, false);
        else if (d.moved && performance.now() - d.lt < 80 && Math.hypot(d.vx, d.vy) > 0.25) this.vel = { x: d.vx, y: d.vy, t: performance.now() };
      } else if (this.pointers.size < 2) this.pinch = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = pos(e); this.zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, x, y); }, { passive: false });
    window.addEventListener('resize', () => this.resize());
  }
  tap(sx, sy, long) {
    // counters of neighbouring regions may overlap: take the nearest one, preferring our own troops
    let best = null, bd = 1e9;
    const pl = this.G && this.G.player;
    for (const h of this.hits) {
      if (!(sx >= h.x - 4 && sx <= h.x + h.w + 4 && sy >= h.y - 4 && sy <= h.y + h.h + 4)) continue;
      let d = Math.hypot(sx - (h.x + h.w / 2), sy - (h.y + h.h / 2));
      if (h.o === pl) d -= 6;
      if (h.type === 'battle') d += 4;
      if (d < bd) { bd = d; best = h; }
    }
    if (best) { this.hooks.onHit(best, long); return; }
    const [mx, my] = this.toMap(sx, sy);
    const r = regionAtXY(mx, my, 22 / this.cam.s);
    if (r >= 0) { this.hooks.onRegion(r, long); return; }
    const z = seaAtXY(mx, my);
    if (z >= 0) this.hooks.onSea(z, long); else this.hooks.onNothing();
  }

  // ---- colours ----
  polCol(tag) {
    let c = this.colCache[tag];
    if (!c) { const d = COUNTRIES[tag]; c = this.colCache[tag] = { full: hex2rgb(d ? d.col : '#888888') }; c.soft = mix(c.full, PAPER, 0.3); }
    return c;
  }
  regionColor(i) {
    const G = this.G, r = G.reg[i], pl = G.player;
    switch (this.mode) {
      case 'ter': return css(hex2rgb(TERRAIN[REG[i].terrain].col));
      case 'ind': { const n = r.civ + r.mil + r.dock; return css(mix([236, 228, 208], [176, 92, 48], clamp(n / 14, 0, 1))); }
      case 'sup': {
        const cap = regionSupplyCap(G, i);
        let use = 0;
        for (const d of divsIn(G, i)) use += G.ctr[d.o].tpl[d.t]._s.sup;
        if (use <= 0) return css(mix([226, 222, 206], [150, 170, 150], r.infra / 6));
        const k = use / cap;
        return css(k < 0.7 ? [140, 190, 130] : k < 1 ? [226, 200, 110] : [214, 110, 90]);
      }
      case 'dip': {
        if (!pl) break;
        const o = r.c;
        if (o === pl) return '#5d8fc4';
        if (atWar(G, pl, o)) return '#c5594d';
        if (sameSide(G, pl, o)) return '#79b987';
        const op = opinion(G, pl, o);
        return css(op >= 0 ? mix([214, 208, 190], [150, 196, 150], clamp(op / 80, 0, 1)) : mix([214, 208, 190], [224, 150, 104], clamp(-op / 80, 0, 1)));
      }
      default:
    }
    const c = this.polCol(r.c);
    return css(this.mode === 'air' || this.mode === 'nav' ? mix(c.soft, PAPER, 0.45) : c.soft);
  }
  path(i, lod) {
    const cache = this.pathCache[lod];
    return cache[i] || (cache[i] = ringsPath(regionRings(i, lod === 1)));
  }
  buildBorders() {
    const G = this.G;
    const out = [0, 1].map(() => ({ inner: new Path2D(), nation: new Path2D(), front: new Path2D(), myfront: new Path2D() }));
    const pl = G.player;
    ARC_OWNER.forEach((o, i) => {
      if (o[1] < 0 || o[0] < 0) return;
      const a = G.reg[o[0]].c, b = G.reg[o[1]].c;
      let key = 'inner';
      if (a !== b) key = atWar(G, a, b) ? (pl && (a === pl || b === pl || sameSide(G, a, pl) || sameSide(G, b, pl)) ? 'myfront' : 'front') : 'nation';
      arcInto(out[0][key], ARCS[i]); arcInto(out[1][key], ARCS_LO[i]);
    });
    this.borders = out;
    // country label anchors
    const seen = new Uint8Array(NREG);
    const best = {};
    for (let i = 0; i < NREG; i++) {
      if (seen[i]) continue;
      const tag = G.reg[i].c;
      const q = [i];
      seen[i] = 1;
      let A = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1e9;
      const comp = [];
      while (q.length) {
        const u = q.pop();
        comp.push(u);
        const b = REG[u].bb, a = (b[2] - b[0]) * (b[3] - b[1]) * 0.55;
        A += a; sx += REG[u].c[0] * a; sy += REG[u].c[1] * a; x0 = Math.min(x0, b[0]); x1 = Math.max(x1, b[2]);
        for (const v of REG[u].adj) if (!seen[v] && G.reg[v].c === tag) { seen[v] = 1; q.push(v); }
      }
      if (!best[tag] || A > best[tag].A) {
        const cx = sx / A, cy = sy / A;
        let bi = comp[0], bd = 1e18;
        for (const u of comp) { const d = (REG[u].c[0] - cx) ** 2 + (REG[u].c[1] - cy) ** 2; if (d < bd) { bd = d; bi = u; } }
        best[tag] = { A, x: (REG[bi].c[0] + cx) / 2, y: (REG[bi].c[1] + cy) / 2, w: x1 - x0, tag };
      }
    }
    this.labels = Object.values(best);
  }

  // ---- drawing ----
  frame() {
    if (this.vel) {
      const now = performance.now(), dt = Math.min(40, now - this.vel.t);
      this.vel.t = now;
      this.cam.x -= (this.vel.x * dt) / this.cam.s; this.cam.y -= (this.vel.y * dt) / this.cam.s;
      const k = Math.pow(0.994, dt);
      this.vel.x *= k; this.vel.y *= k;
      if (Math.hypot(this.vel.x, this.vel.y) < 0.02) this.vel = null;
      this.clampCam();
    }
    this.dirty = false;
    if (this.G) this.draw();
  }
  draw() {
    const { ctx, G, dpr, w, h } = this;
    const s = this.cam.s;
    const lod = s < LOD_SWITCH ? 1 : 0;
    const key = (G._capSeq || 0) + ':' + G.day + ':' + Object.keys(G.war).length + ':' + G.player;
    if (key !== this.borderKey) { this.buildBorders(); this.borderKey = key; }
    const tx = w / 2 - this.cam.x * s, ty = h / 2 - this.cam.y * s;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = SEA_COL; ctx.fillRect(0, 0, w, h);
    const mapT = () => ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty);
    const x0 = this.cam.x - w / 2 / s, x1 = this.cam.x + w / 2 / s, y0 = this.cam.y - h / 2 / s, y1 = this.cam.y + h / 2 / s;
    const vis = [];
    for (let i = 0; i < NREG; i++) { const b = REG[i].bb; if (b[2] >= x0 && b[0] <= x1 && b[3] >= y0 && b[1] <= y1) vis.push(i); }
    mapT();
    // sea zones
    if (this.mode === 'nav' && G.player) {
      for (const z of SEA) {
        let own = 0, foe = 0;
        for (const f of G.fleets) { if (f.zone !== z.id) continue; if (f.o === G.player || sameSide(G, f.o, G.player)) own += fleetSize(f); else if (atWar(G, G.player, f.o)) foe += fleetSize(f); }
        if (own || foe) { ctx.fillStyle = own >= foe ? 'rgba(60,110,190,0.28)' : 'rgba(190,70,60,0.28)'; ctx.fill(this.seaPaths[z.id]); }
        else if (G.ctr[G.player]._lanes && G.ctr[G.player]._lanes[z.id]) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill(this.seaPaths[z.id]); }
      }
    }
    if (this.sel.sea >= 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill(this.seaPaths[this.sel.sea]); }
    ctx.lineWidth = 1 / s; ctx.strokeStyle = this.mode === 'nav' ? 'rgba(40,80,110,0.55)' : 'rgba(60,100,125,0.22)';
    for (const z of SEA) ctx.stroke(this.seaPaths[z.id]);
    // land
    const occ = [];
    for (const i of vis) {
      ctx.fillStyle = this.regionColor(i);
      ctx.fill(this.path(i, lod));
      if (G.reg[i].c !== G.reg[i].o && (this.mode === 'pol')) occ.push(i);
    }
    // occupation hatch
    if (occ.length && (occ.length < 160 || s > 0.03)) {
      if (!this.hatch) {
        const c = document.createElement('canvas'); c.width = c.height = 8;
        const x = c.getContext('2d'); x.strokeStyle = 'rgba(30,20,10,0.3)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-6, 10); x.lineTo(6, -2); x.moveTo(2, 10); x.lineTo(14, -2); x.stroke();
        this.hatch = ctx.createPattern(c, 'repeat');
      }
      for (const i of occ) {
        ctx.save(); ctx.clip(this.path(i, lod));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const b = REG[i].bb; const [ax, ay] = this.toScreen(b[0], b[1]); const [bx, by] = this.toScreen(b[2], b[3]);
        ctx.fillStyle = this.hatch; ctx.fillRect(Math.max(0, ax), Math.max(0, ay), Math.min(w, bx) - Math.max(0, ax), Math.min(h, by) - Math.max(0, ay));
        ctx.restore();
      }
      mapT();
    }
    // overlays: pick candidates, air range
    if (this.pick && this.pick.valid) { ctx.fillStyle = 'rgba(70,160,90,0.38)'; for (const i of vis) if (this.pick.valid(i)) ctx.fill(this.path(i, lod)); }
    if (this.sel.wing && G.ctr[this.sel.wing.o]) {
      const wg = this.sel.wing;
      ctx.fillStyle = 'rgba(60,110,200,0.22)';
      const inR = new Set(regionsInRange(wg.base, planeRange(G.ctr[wg.o], wg.t)));
      for (const i of vis) if (inR.has(i)) ctx.fill(this.path(i, lod));
    }
    ctx.fillStyle = SEA_COL; ctx.fill(this.lakePath);
    if (s > 0.045) { ctx.strokeStyle = 'rgba(90,140,170,0.55)'; ctx.lineWidth = 1.1 / s; ctx.stroke(this.riverPath); }
    const B = this.borders[lod];
    if (s > 0.022) { ctx.strokeStyle = 'rgba(70,55,40,0.28)'; ctx.lineWidth = 0.8 / s; ctx.stroke(B.inner); }
    ctx.strokeStyle = 'rgba(70,95,110,0.9)'; ctx.lineWidth = 1 / s; ctx.stroke(this.coast[lod]);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(50,38,30,0.85)'; ctx.lineWidth = (s > 0.04 ? 1.8 : 1.1) / s; ctx.stroke(B.nation);
    ctx.strokeStyle = 'rgba(130,40,30,0.75)'; ctx.lineWidth = 2.2 / s; ctx.stroke(B.front);
    ctx.strokeStyle = '#c0281c'; ctx.lineWidth = 3.4 / s; ctx.stroke(B.myfront);
    if (this.sel.region >= 0) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 / s; ctx.stroke(this.path(this.sel.region, lod));
      ctx.strokeStyle = '#1b2530'; ctx.lineWidth = 1.6 / s; ctx.stroke(this.path(this.sel.region, lod));
    }
    // ---- screen-space layer ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.hits = [];
    this.drawLabels(vis, s);
    if (this.mode === 'ind') this.drawIndustry(vis, s);
    if (this.mode === 'air') this.drawAir(vis, s);
    this.drawFleets(s);
    this.drawStacks(vis, s);
    this.drawArrows(s);
    this.drawBattles(vis, s);
  }
  text(str, x, y, font, fill, halo) {
    const ctx = this.ctx;
    ctx.font = font;
    if (halo) { ctx.strokeStyle = halo; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
  }
  drawLabels(vis, s) {
    const { ctx, G } = this;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (s < 0.16) {
      for (const L of this.labels) {
        const size = Math.min(30, Math.sqrt(L.A) * s * 0.2);
        if (size < 8.5) continue;
        const [x, y] = this.toScreen(L.x, L.y);
        if (x < -80 || x > this.w + 80 || y < -20 || y > this.h + 20) continue;
        const name = (G.ctr[L.tag].name || COUNTRIES[L.tag].n).toUpperCase();
        let px = size;
        ctx.font = `700 ${px}px system-ui, sans-serif`;
        const tw = ctx.measureText(name).width, maxW = L.w * s * 0.95;
        if (tw > maxW) { px = (px * maxW) / tw; if (px < 8) continue; }
        ctx.globalAlpha = 0.62;
        this.text(name, x, y, `700 ${px}px system-ui, sans-serif`, '#2a2218', 'rgba(245,238,220,0.7)');
        ctx.globalAlpha = 1;
      }
    }
    if (s >= 0.02 && s < 0.5) {
      const a = this.mode === 'nav' ? 0.85 : 0.5;
      for (const z of SEA) {
        const [x, y] = this.toScreen(z.c[0], z.c[1]);
        if (x < -60 || x > this.w + 60 || y < 0 || y > this.h) continue;
        ctx.globalAlpha = a;
        this.text(z.name, x, y + 26, `italic ${s > 0.05 ? 12 : 10}px system-ui, sans-serif`, '#2f5670');
        ctx.globalAlpha = 1;
      }
    }
    if (s >= 0.13) {
      for (const i of vis) {
        const R = REG[i], r = G.reg[i];
        const [x, y] = this.toScreen(R.c[0], R.c[1]);
        const cap = G.ctr[r.o] && G.ctr[r.o].cap === i;
        this.text((cap ? '★ ' : '') + R.name, x, y + 24, `${cap ? 700 : 500} 11px system-ui, sans-serif`, '#2a2a22', 'rgba(245,238,220,0.75)');
        if (s >= 0.2 && r.vp >= 2) this.text(`очки ${r.vp}`, x, y + 37, '10px system-ui, sans-serif', '#6a4a2a', 'rgba(245,238,220,0.7)');
      }
    }
  }
  drawIndustry(vis, s) {
    if (s < 0.05) return;
    const { ctx, G } = this;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const i of vis) {
      const r = G.reg[i];
      const [x, y] = this.toScreen(REG[i].c[0], REG[i].c[1]);
      let t = '';
      if (r.civ) t += `Г${r.civ} `;
      if (r.mil) t += `В${r.mil} `;
      if (r.dock) t += `⚓${r.dock}`;
      if (t) this.text(t.trim(), x, y - 4, '700 11px system-ui, sans-serif', '#3a1f10', 'rgba(250,244,230,0.85)');
      let k = 0;
      for (const key in r.res) {
        const str = `${RES[key].name.slice(0, 3)} ${r.res[key]}`;
        ctx.font = '10px system-ui, sans-serif';
        const tw = ctx.measureText(str).width + 8;
        const bx = x - tw / 2, by = y + 8 + k * 14;
        ctx.fillStyle = RES[key].col; ctx.fillRect(bx, by, tw, 12);
        ctx.fillStyle = '#fff'; ctx.fillText(str, x, by + 6.5);
        k++;
      }
    }
  }
  drawAir(vis, s) {
    const { ctx, G } = this;
    if (s < 0.03) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const load = {};
    for (const wg of G.wings) load[wg.base] = (load[wg.base] || 0) + wg.n;
    for (const i of vis) {
      const r = G.reg[i];
      if (!r.air) continue;
      const [x, y] = this.toScreen(REG[i].c[0], REG[i].c[1]);
      const n = Math.round(load[i] || 0);
      ctx.fillStyle = n ? '#2e5f8f' : 'rgba(46,95,143,0.45)';
      ctx.beginPath(); ctx.arc(x, y - 18, 10, 0, 6.3); ctx.fill();
      this.text('✈', x, y - 18, '12px system-ui, sans-serif', '#fff');
      this.text(`${n}/${r.air * 200}`, x, y - 4, '700 10px system-ui, sans-serif', '#1d3550', 'rgba(250,244,230,0.85)');
    }
  }
  drawStacks(vis, s) {
    const { ctx, G } = this;
    if (s < 0.03) return;
    const pl = G.player;
    // at small scales only the armies that matter to the player are drawn
    const showAll = s >= 0.16 || !pl;
    const relevant = (o) => showAll || o === pl || atWar(G, pl, o) || (sameSide(G, pl, o) && enemies(G, o).length > 0) || this.sel.region >= 0 && false;
    const f = clamp(s / 0.12, 0.72, 1.3);
    const W = 31 * f, H = 19 * f;
    ctx.textBaseline = 'middle';
    for (const i of vis) {
      const list = divsIn(G, i);
      if (!list.length) continue;
      const groups = new Map();
      for (const d of list) {
        if (!relevant(d.o)) continue;
        let g = groups.get(d.o);
        if (!g) groups.set(d.o, (g = { o: d.o, n: 0, org: 0, arm: 0, mov: 0, sel: 0, low: 0 }));
        const c = G.ctr[d.o], st = c.tpl[d.t]._s;
        g.n++; g.org += d.org / st.org; if (c.tpl[d.t].icon === 'arm') g.arm++; if (d.path.length) g.mov++; if (this.sel.divs.has(d.id)) g.sel++; if (d.sup < 1) g.low++;
      }
      if (!groups.size) continue;
      const arr = Array.from(groups.values()).sort((a, b) => (b.o === pl) - (a.o === pl) || b.n - a.n).slice(0, 3);
      const [cx, cy] = this.toScreen(REG[i].c[0], REG[i].c[1]);
      // several nations in one region: counters are stacked like a deck of cards
      arr.forEach((g, k) => {
        const x = cx - W / 2 + k * 5, y = cy - H / 2 - (arr.length - 1 - k) * (H * 0.62) + (arr.length - 1) * H * 0.31;
        const col = this.polCol(g.o).full;
        const hostile = pl && atWar(G, pl, g.o);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 1.5, y + 2, W, H);
        ctx.fillStyle = css(col); ctx.fillRect(x, y, W, H);
        // NATO-style symbol box
        const bw = H * 0.86, bh = H - 7;
        ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillRect(x + 3, y + 3, bw, bh);
        ctx.strokeStyle = '#1d1d1d'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 3.5, y + 3.5, bw - 1, bh - 1);
        ctx.beginPath();
        if (g.arm * 2 >= g.n) ctx.ellipse(x + 3 + bw / 2, y + 3 + bh / 2, bw * 0.32, bh * 0.28, 0, 0, 6.3);
        else { ctx.moveTo(x + 3.5, y + 3.5); ctx.lineTo(x + 2.5 + bw, y + 2.5 + bh); ctx.moveTo(x + 2.5 + bw, y + 3.5); ctx.lineTo(x + 3.5, y + 2.5 + bh); }
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `700 ${Math.round(11 * f)}px system-ui, sans-serif`;
        ctx.fillStyle = lum(col) > 150 ? '#111' : '#fff';
        ctx.fillText(String(g.n), x + 3 + bw + (W - bw - 5) / 2, y + (H - 3) / 2);
        // organisation bar
        const o = g.org / g.n;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y + H - 3.5, W, 3.5);
        ctx.fillStyle = o > 0.6 ? '#5fd06c' : o > 0.3 ? '#e8c04a' : '#e8604a'; ctx.fillRect(x, y + H - 3.5, W * o, 3.5);
        ctx.lineWidth = g.sel ? 2.5 : 1.2;
        ctx.strokeStyle = g.sel ? '#fff' : hostile ? '#7d1a12' : '#151515';
        ctx.strokeRect(x, y, W, H);
        if (g.low && g.o === pl) { ctx.fillStyle = '#e0452f'; ctx.beginPath(); ctx.arc(x + W - 1, y + 1, 4, 0, 6.3); ctx.fill(); }
        this.hits.push({ x, y, w: W, h: H, type: 'stack', r: i, o: g.o });
      });
    }
  }
  drawFleets(s) {
    const { ctx, G } = this;
    const pl = G.player;
    const by = new Map();
    for (const fl of G.fleets) {
      if (fl.zone < 0) continue;
      const key = fl.zone + '|' + fl.o;
      let g = by.get(key);
      if (!g) by.set(key, (g = { zone: fl.zone, o: fl.o, n: 0, sel: false }));
      g.n += fleetSize(fl); if (this.sel.fleet === fl) g.sel = true;
    }
    const perZone = new Map();
    for (const g of by.values()) (perZone.get(g.zone) || perZone.set(g.zone, []).get(g.zone)).push(g);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    for (const [z, arr] of perZone) {
      arr.sort((a, b) => (b.o === pl) - (a.o === pl) || b.n - a.n);
      const [cx, cy] = this.toScreen(SEA[z].c[0], SEA[z].c[1]);
      if (cx < -80 || cx > this.w + 80 || cy < -40 || cy > this.h + 40) continue;
      arr.slice(0, 3).forEach((g, k) => {
        const W = 40, H = 20;
        const x = cx + (k - (Math.min(3, arr.length) - 1) / 2) * (W + 3) - W / 2, y = cy - H / 2;
        const col = this.polCol(g.o).full;
        ctx.fillStyle = css(col);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + W, y); ctx.lineTo(x + W - 6, y + H); ctx.lineTo(x + 6, y + H); ctx.closePath(); ctx.fill();
        ctx.lineWidth = g.sel ? 2.5 : 1.2; ctx.strokeStyle = g.sel ? '#fff' : pl && atWar(G, pl, g.o) ? '#7d1a12' : '#151515'; ctx.stroke();
        ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = lum(col) > 150 ? '#111' : '#fff';
        ctx.fillText('⚓ ' + g.n, x + W / 2, y + H / 2);
        this.hits.push({ x, y, w: W, h: H, type: 'fleet', z, o: g.o });
      });
    }
  }
  drawBattles(vis, s) {
    const { ctx, G } = this;
    for (const key in G.battles) {
      const b = G.battles[key];
      const [x, y0] = this.toScreen(REG[b.r].c[0], REG[b.r].c[1]);
      if (x < -20 || x > this.w + 20 || y0 < -20 || y0 > this.h + 20) continue;
      const y = y0 - (s >= 0.03 ? 24 : 0);
      ctx.fillStyle = '#d23a2a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i * Math.PI) / 8, rr = i % 2 ? 5 : 10; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (s >= 0.03) {
        ctx.fillStyle = '#b8402f'; ctx.fillRect(x - 14, y + 11, 28, 4);
        ctx.fillStyle = '#3f79b5'; ctx.fillRect(x - 14, y + 11, 28 * clamp(b.bal, 0, 1), 4);
      }
      this.hits.push({ x: x - 12, y: y - 12, w: 24, h: 24, type: 'battle', r: b.r });
    }
  }
  arrow(pts, col, width) {
    const ctx = this.ctx;
    if (pts.length < 2) return;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? col : 'rgba(255,255,255,0.85)'; ctx.lineWidth = pass ? width : width + 2.5;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 9 + width;
      ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45));
      ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45)); ctx.stroke();
    }
  }
  drawArrows(s) {
    const { G } = this;
    const pl = G.player;
    if (!pl) return;
    const seen = new Set();
    const sc = (r) => this.toScreen(REG[r].c[0], REG[r].c[1]);
    // selected divisions: full path
    for (const id of this.sel.divs) {
      const d = G.divs[id];
      if (!d || d.sea || !d.path.length) continue;
      const key = d.r + '>' + d.path.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const tgt = d.path[d.path.length - 1];
      this.arrow([sc(d.r), ...d.path.map(sc)], atWar(G, pl, G.reg[tgt].c) ? '#c0281c' : '#2e5f8f', 3.5);
    }
    if (s >= 0.06) {
      for (const id in G.divs) {
        const d = G.divs[id];
        if (d.o !== pl || d.sea || !d.path.length || this.sel.divs.has(d.id)) continue;
        const key = d.r + '>' + d.path[0];
        if (seen.has(key)) continue;
        seen.add(key);
        const a = sc(d.r), b = sc(d.path[0]);
        this.arrow([a, [a[0] + (b[0] - a[0]) * 0.6, a[1] + (b[1] - a[1]) * 0.6]], atWar(G, pl, G.reg[d.path[0]].c) ? 'rgba(192,40,28,0.8)' : 'rgba(46,95,143,0.7)', 2.2);
      }
    }
    for (const t of G.invasions) {
      if (t.o !== pl) continue;
      const ctx = this.ctx;
      ctx.setLineDash([7, 5]);
      this.arrow([sc(t.from), sc(t.to)], t.kind === 'inv' ? '#c0281c' : '#2e5f8f', 2.5);
      ctx.setLineDash([]);
    }
  }
}
export { friendly };
