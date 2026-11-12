// Static world geometry: land regions, sea zones, adjacency, distances, path finding.
import MAPDATA from '../data/map.json';

const D2R = Math.PI / 180;
export const MAP_W = MAPDATA.w;
export const MAP_H = MAPDATA.h;
const UNITS_PER_RAD = 18000 / Math.PI;
const YTOP = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * MAPDATA.latMax * D2R));

/** lon/lat -> map units */
export function project(lon, lat) {
  const sx = lon >= MAPDATA.cut ? lon - MAPDATA.lon0 : lon + 360 - MAPDATA.lon0;
  const my = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * D2R));
  return [(sx + 180) * 100, (YTOP - my) * UNITS_PER_RAD];
}
/** map units -> [lon, lat] */
export function unproject(x, y) {
  let lon = x / 100 - 180 + MAPDATA.lon0;
  if (lon > 180) lon -= 360;
  const my = YTOP - y / UNITS_PER_RAD;
  const lat = (Math.atan(Math.exp(my / 1.25)) - Math.PI / 4) / 0.4 / D2R;
  return [lon, lat];
}

function decodeArcs(src) {
  return src.map((a) => {
    const n = a.length / 2;
    const out = new Float32Array(a.length);
    let x = a[0], y = a[1];
    out[0] = x; out[1] = y;
    for (let i = 1; i < n; i++) {
      x += a[2 * i]; y += a[2 * i + 1];
      out[2 * i] = x; out[2 * i + 1] = y;
    }
    return out;
  });
}

export const ARCS = decodeArcs(MAPDATA.arcs);
export const ARCS_LO = decodeArcs(MAPDATA.arcsLo);
export const ARC_OWNER = MAPDATA.arcOwner;      // [regionA, regionB|-1]
export const LAKES = MAPDATA.lakes;
export const RIVERS = MAPDATA.rivers;
export const SEA_LINKS = MAPDATA.seaLinks;      // [zoneA, zoneB, controllingRegion]

export const TERRAIN = {
  plains:   { name: 'Равнина',  move: 1.0,  atk: 0,     width: 1.0,  sup: 1.0,  col: '#cdd4a3' },
  forest:   { name: 'Лес',      move: 0.75, atk: -0.2,  width: 0.8,  sup: 0.85, col: '#9db98a' },
  hills:    { name: 'Холмы',    move: 0.75, atk: -0.25, width: 0.85, sup: 0.9,  col: '#c9bb8e' },
  mountain: { name: 'Горы',     move: 0.5,  atk: -0.45, width: 0.6,  sup: 0.6,  col: '#a89a86' },
  desert:   { name: 'Пустыня',  move: 0.85, atk: -0.1,  width: 1.0,  sup: 0.5,  col: '#e6d6a0' },
  jungle:   { name: 'Джунгли',  move: 0.55, atk: -0.3,  width: 0.8,  sup: 0.55, col: '#7fae7a' },
  marsh:    { name: 'Болота',   move: 0.5,  atk: -0.35, width: 0.75, sup: 0.6,  col: '#93b0a0' },
  urban:    { name: 'Город',    move: 0.9,  atk: -0.3,  width: 1.1,  sup: 1.3,  col: '#bdb7b0' },
  tundra:   { name: 'Тундра',   move: 0.6,  atk: -0.15, width: 0.8,  sup: 0.4,  col: '#c5cfc9' },
};

/** @type {Array<any>} static region records */
export const REG = MAPDATA.regions.map((r) => {
  const [lon, lat] = unproject(r.c[0], r.c[1]);
  return {
    id: r.id, name: r.n, tag0: r.t, adm0: r.a, sp: r.sp, polys: r.p, c: r.c, bb: r.bb,
    area: r.ar, terrain: r.tr, popW: r.pop, cities: r.ci,
    adj: [], adjLen: [], strait: r.st || [],
    seas: r.sea.map((s) => s[0]), coast: r.sea.reduce((a, s) => a + s[1], 0),
    lon, lat,
  };
});
export const NREG = REG.length;
for (const r of MAPDATA.regions) {
  const R = REG[r.id];
  for (const [o, len] of r.adj) { R.adj.push(o); R.adjLen.push(len); }
  for (const o of r.st || []) { if (!R.adj.includes(o)) { R.adj.push(o); R.adjLen.push(40); } }
}

export const SEA = MAPDATA.seas.map((s) => ({ id: s.id, name: s.n, c: s.c, adj: s.adj.slice(), polys: s.p, coast: [] }));
export const NSEA = SEA.length;
for (const R of REG) for (const z of R.seas) SEA[z].coast.push(R.id);

// --- distances (km) between region centres --------------------------------------------------
function haversine(lon1, lat1, lon2, lat2) {
  const dLat = (lat2 - lat1) * D2R, dLon = (lon2 - lon1) * D2R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}
const DIST = new Float32Array(NREG * NREG);
for (let i = 0; i < NREG; i++) {
  for (let j = i + 1; j < NREG; j++) {
    const d = haversine(REG[i].lon, REG[i].lat, REG[j].lon, REG[j].lat);
    DIST[i * NREG + j] = d; DIST[j * NREG + i] = d;
  }
}
export const distKm = (a, b) => DIST[a * NREG + b];

const seaLonLat = SEA.map((s) => unproject(s.c[0], s.c[1]));
export function distSeaRegionKm(zone, region) {
  const [lon, lat] = seaLonLat[zone];
  return haversine(lon, lat, REG[region].lon, REG[region].lat);
}

const rangeCache = new Map();
/** list of region ids within `km` of region `from` (cached) */
export function regionsInRange(from, km) {
  const key = from * 100000 + Math.round(km);
  let v = rangeCache.get(key);
  if (!v) {
    v = [];
    for (let i = 0; i < NREG; i++) if (DIST[from * NREG + i] <= km) v.push(i);
    rangeCache.set(key, v);
  }
  return v;
}

// --- point lookup ------------------------------------------------------------------------------
function ringPoints(ring, arcs) {
  const pts = [];
  for (const ai of ring) {
    const a = ai >= 0 ? arcs[ai] : arcs[~ai];
    const n = a.length / 2;
    if (ai >= 0) for (let i = pts.length ? 1 : 0; i < n; i++) pts.push(a[2 * i], a[2 * i + 1]);
    else for (let i = n - 1 - (pts.length ? 1 : 0); i >= 0; i--) pts.push(a[2 * i], a[2 * i + 1]);
  }
  return pts;
}
const ringCache = { hi: new Map(), lo: new Map() };
export function regionRings(id, lo) {
  const cache = lo ? ringCache.lo : ringCache.hi;
  let v = cache.get(id);
  if (!v) {
    v = REG[id].polys.map((poly) => poly.map((ring) => ringPoints(ring, lo ? ARCS_LO : ARCS)));
    cache.set(id, v);
  }
  return v;
}
function inRing(pts, x, y) {
  let inside = false;
  for (let i = 0, n = pts.length / 2, j = n - 1; i < n; j = i++) {
    const xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function pointInRegion(id, x, y) {
  const R = REG[id];
  if (x < R.bb[0] || x > R.bb[2] || y < R.bb[1] || y > R.bb[3]) return false;
  for (const poly of regionRings(id, false)) {
    if (inRing(poly[0], x, y)) {
      let hole = false;
      for (let h = 1; h < poly.length; h++) if (inRing(poly[h], x, y)) { hole = true; break; }
      if (!hole) return true;
    }
  }
  return false;
}
/** region at map coordinates, or -1; `slop` (map units) lets small islands be tapped easily */
export function regionAtXY(x, y, slop = 0) {
  for (let i = 0; i < NREG; i++) if (pointInRegion(i, x, y)) return i;
  if (slop > 0) {
    let best = -1, bd = slop * slop;
    for (let i = 0; i < NREG; i++) {
      const R = REG[i];
      if (R.bb[2] - R.bb[0] > 260) continue;      // only small regions get the tap halo
      const dx = R.c[0] - x, dy = R.c[1] - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  return -1;
}
export function seaAtXY(x, y) {
  for (const s of SEA) {
    for (const poly of s.polys) {
      if (inRing(poly[0], x, y)) {
        let hole = false;
        for (let h = 1; h < poly.length; h++) if (inRing(poly[h], x, y)) { hole = true; break; }
        if (!hole) return s.id;
      }
    }
  }
  return -1;
}
export function regionAtLonLat(lon, lat) {
  const [x, y] = project(lon, lat);
  let r = regionAtXY(x, y);
  if (r >= 0) return r;
  let best = -1, bd = 1e18;
  for (let i = 0; i < NREG; i++) {
    const dx = REG[i].c[0] - x, dy = REG[i].c[1] - y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// --- path finding ------------------------------------------------------------------------------
/**
 * Dijkstra over land regions. `cost(from,to)` returns step cost or Infinity when impassable.
 * Returns array of region ids excluding the start, or null.
 */
export function findPath(from, to, cost, maxCost = 1e9) {
  if (from === to) return [];
  const dist = new Float64Array(NREG).fill(Infinity);
  const prev = new Int32Array(NREG).fill(-1);
  const done = new Uint8Array(NREG);
  dist[from] = 0;
  // small binary heap
  const heap = [[0, from]];
  while (heap.length) {
    // pop min
    let mi = 0;
    for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[mi][0]) mi = i;
    const [d, u] = heap[mi];
    heap[mi] = heap[heap.length - 1]; heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === to) break;
    if (d > maxCost) break;
    const R = REG[u];
    for (let k = 0; k < R.adj.length; k++) {
      const v = R.adj[k];
      if (done[v]) continue;
      const c = cost(u, v);
      if (!(c < Infinity)) continue;
      const nd = d + c;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; heap.push([nd, v]); }
    }
  }
  if (prev[to] < 0) return null;
  const path = [];
  for (let v = to; v !== from; v = prev[v]) path.push(v);
  return path.reverse();
}

/** BFS over sea zones; `ok(zone)` filters; returns list of zones from a to b inclusive, or null */
export function seaPath(a, b, ok) {
  if (a === b) return [a];
  const prev = new Int32Array(NSEA).fill(-1);
  const seen = new Uint8Array(NSEA);
  const q = [a];
  seen[a] = 1;
  while (q.length) {
    const u = q.shift();
    for (const v of SEA[u].adj) {
      if (seen[v] || (ok && !ok(u, v))) continue;
      seen[v] = 1; prev[v] = u;
      if (v === b) {
        const path = [b];
        for (let x = u; x !== -1; x = prev[x]) path.push(x);
        return path.reverse();
      }
      q.push(v);
    }
  }
  return null;
}

// --- land masses (connected components of the land graph; used for trade routes & sea transport) ---
export const LANDMASS = new Int16Array(NREG).fill(-1);
{
  let id = 0;
  for (let i = 0; i < NREG; i++) {
    if (LANDMASS[i] >= 0) continue;
    const q = [i];
    LANDMASS[i] = id;
    while (q.length) {
      const u = q.pop();
      for (const v of REG[u].adj) if (LANDMASS[v] < 0) { LANDMASS[v] = id; q.push(v); }
    }
    id++;
  }
}
