#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Builds the game map (land regions in 1936 borders + sea zones) from Natural Earth data.

Usage: python3 build_map.py <natural_earth_dir> <work_dir> <out_json> [mapshaper_bin]
Natural Earth is public domain (naturalearthdata.com).
"""
import sys, os, json, math, heapq, subprocess, unicodedata, collections
import numpy as np
import geopandas as gpd
import shapely
from shapely.geometry import box, Point, Polygon, MultiPolygon, MultiPoint, shape, mapping, LineString
from shapely.ops import unary_union, polylabel
from shapely import affinity
from shapely.strtree import STRtree
from scipy.cluster.vq import kmeans2
from scipy import ndimage
import rasterio.features
from rasterio.transform import Affine

import config as C

NE, WORK, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
MAPSHAPER = sys.argv[4] if len(sys.argv) > 4 else 'mapshaper'
os.makedirs(WORK, exist_ok=True)

CUT_LON = -168.9
LON0 = CUT_LON + 180.0
LAT_MAX, LAT_MIN = 75.0, -56.0
R = 18000.0 / math.pi          # map units per radian: world width = 36000 units


def miller(lat):
    return 1.25 * np.log(np.tan(np.pi / 4 + 0.4 * np.radians(lat)))


YTOP = float(miller(LAT_MAX))
MAP_W = 36000
MAP_H = int(math.ceil((YTOP - float(miller(LAT_MIN))) * R))


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or ''))
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return s.lower().replace("'", '').replace('`', '').replace('’', '').replace(' ', '').replace('-', '')


WEST = box(-180, -90, CUT_LON, 90)
EAST = box(CUT_LON, -90, 180.0001, 90)
LATBOX = box(-181, LAT_MIN, 181, LAT_MAX)


def shift(geom):
    """lon -> shifted lon in [-180,180] with the map seam at CUT_LON."""
    minx, miny, maxx, maxy = geom.bounds
    if minx >= CUT_LON:
        g = affinity.translate(geom, xoff=-LON0)
    elif maxx <= CUT_LON:
        g = affinity.translate(geom, xoff=360 - LON0)
    else:
        a = geom.intersection(EAST)
        b = geom.intersection(WEST)
        parts = []
        if not a.is_empty:
            parts.append(affinity.translate(a, xoff=-LON0))
        if not b.is_empty:
            parts.append(affinity.translate(b, xoff=360 - LON0))
        g = unary_union(parts)
    return g.intersection(LATBOX)


def shift_pt(lon, lat):
    return (lon - LON0 if lon >= CUT_LON else lon + 360 - LON0, lat)


def project(geom):
    def f(a):
        return np.column_stack([(a[:, 0] + 180.0) * 100.0, (YTOP - miller(a[:, 1])) * R])
    return shapely.transform(geom, f)


def proj_pt(lon, lat):
    x, y = shift_pt(lon, lat)
    return ((x + 180.0) * 100.0, (YTOP - float(miller(y))) * R)


def km2(geom):
    """approximate area in km2 of a lon/lat geometry"""
    if geom.is_empty:
        return 0.0
    tot = 0.0
    for p in polys(geom):
        c = p.centroid
        tot += p.area * (111.32 ** 2) * math.cos(math.radians(c.y))
    return tot


def polys(geom):
    if geom is None or geom.is_empty:
        return []
    if geom.geom_type == 'Polygon':
        return [geom]
    if geom.geom_type == 'MultiPolygon':
        return list(geom.geoms)
    if geom.geom_type == 'GeometryCollection':
        out = []
        for g in geom.geoms:
            out += polys(g)
        return out
    return []


def clean(geom):
    if geom is None:
        return None
    if not geom.is_valid:
        geom = shapely.make_valid(geom)
    ps = polys(geom)
    if not ps:
        return None
    return MultiPolygon(ps) if len(ps) > 1 else ps[0]


# ----------------------------------------------------------------------------------------------
print('loading admin-1 ...')
adm = gpd.read_file(os.path.join(NE, 'ne_10m_admin_1_states_provinces', 'ne_10m_admin_1_states_provinces.shp'))
places = gpd.read_file(os.path.join(NE, 'ne_10m_populated_places', 'ne_10m_populated_places.shp'))

override_idx = {}
for a0, names, tag, sp, gadm in C.OVERRIDES:
    if names is None:
        override_idx[(a0, None)] = (tag, sp, gadm)
    else:
        for n in names:
            override_idx[(a0, norm(n))] = (tag, sp, gadm)
drop_units = {(a, norm(n)) for a, n in C.DROP_UNITS}
clips = collections.defaultdict(list)
for a0, name, poly, tag, sp, gadm, pname in C.CLIPS:
    clips[(a0, norm(name))].append((Polygon(poly), tag, sp, gadm, pname))

circle_geoms = []
for lon, lat, r, tag, name, key, carve in C.CIRCLES:
    sx, sy = shift_pt(lon, lat)
    # circle in projected space looks round if we stretch latitude a bit; keep simple ellipse
    g = Point(sx, sy).buffer(r, 24)
    g = affinity.scale(g, xfact=1.0, yfact=math.cos(math.radians(lat)) ** 0.5 if abs(lat) > 20 else 1.0, origin=(sx, sy))
    circle_geoms.append(dict(geom=g, tag=tag, name=name, key=key, carve=carve, lon=lon, lat=lat))
carve_union = unary_union([c['geom'] for c in circle_geoms if c['carve']])

units = []
skipped = collections.Counter()
for _, r in adm.iterrows():
    a0 = r['adm0_a3']
    name = r['name'] if isinstance(r['name'], str) else ''
    if (a0, norm(name)) in drop_units:
        continue
    geom = clean(r.geometry)
    if geom is None:
        continue
    if a0 == 'USA':
        geom = clean(geom.intersection(EAST))
        if geom is None:
            continue
    galias = C.ALIAS.get(a0, a0)
    pieces = [(geom, None, None, None, None)]
    if (a0, norm(name)) in clips:
        rest = geom
        pieces = []
        for cpoly, tag, sp, gadm, pname in clips[(a0, norm(name))]:
            part = clean(geom.intersection(cpoly))
            if part is not None:
                pieces.append((part, tag, sp, gadm, pname))
                rest = rest.difference(cpoly)
        rest = clean(rest)
        if rest is not None:
            pieces.append((rest, None, None, None, None))
    for g, tag, sp, gadm, pname in pieces:
        if tag is None:
            ov = override_idx.get((a0, norm(name))) or override_idx.get((a0, None))
            if ov:
                tag, sp, gadm = ov
            else:
                tag, sp, gadm = C.OWNER.get(galias), '', None
        if tag is None:
            skipped[a0] += 1
            continue
        g = clean(shift(g))
        if g is None:
            continue
        if g.intersects(carve_union):
            g = clean(g.difference(carve_union))
            if g is None:
                continue
        nm_ru = r['name_ru'] if isinstance(r['name_ru'], str) else name
        units.append(dict(geom=g, tag=tag, sp=sp or '', adm0=gadm or galias, name=name,
                          name_ru=pname or nm_ru, fixed_name=pname))
print('units', len(units), 'skipped adm0:', dict(skipped))

# ---- split very large units -------------------------------------------------------------------
def split_unit(u):
    area = km2(u['geom'])
    if area < C.SPLIT_OVER:
        return [u]
    n = int(math.ceil(area / C.SPLIT_PIECE))
    g = u['geom']
    minx, miny, maxx, maxy = g.bounds
    step = max((maxx - minx), (maxy - miny)) / 70.0
    pts = []
    y = miny + step / 2
    while y < maxy:
        x = minx + step / 2
        cl = math.cos(math.radians(y))
        while x < maxx:
            if g.contains(Point(x, y)):
                pts.append((x * cl, y))
            x += step
        y += step
    pts = np.array(pts)
    cent, lab = kmeans2(pts, n, minit='++', seed=7)
    clat = math.cos(math.radians((miny + maxy) / 2))
    mp = MultiPoint([(cx / max(0.05, math.cos(math.radians(cy))), cy) for cx, cy in cent])
    vor = shapely.voronoi_polygons(mp, extend_to=box(minx - 5, miny - 5, maxx + 5, maxy + 5))
    out = []
    gc = g.centroid
    for cell in vor.geoms:
        part = clean(g.intersection(cell))
        if part is None or km2(part) < 2000:
            continue
        pc = part.centroid
        dx, dy = (pc.x - gc.x) * clat, pc.y - gc.y
        if abs(dx) > abs(dy):
            suffix = 'восток' if dx > 0 else 'запад'
        else:
            suffix = 'север' if dy > 0 else 'юг'
        nu = dict(u)
        nu['geom'] = part
        nu['name_ru'] = f"{u['name_ru']} ({suffix})"
        nu['was_split'] = True
        out.append(nu)
    return out or [u]


tmp = []
for u in units:
    tmp += split_unit(u)
units = tmp
print('units after split', len(units))

for i, u in enumerate(units):
    u['id'] = i
    u['area'] = km2(u['geom'])
    u['sgeom'] = u['geom'].simplify(0.01, preserve_topology=True)
    c = u['geom'].representative_point()
    u['cx'], u['cy'] = c.x, c.y
    u['pop'] = 0.0
    u['cities'] = []

# ---- cities ------------------------------------------------------------------------------------
print('assigning cities ...')
tree = STRtree([u['sgeom'] for u in units])
city_list = []
for _, p in places.iterrows():
    lon, lat = float(p['LONGITUDE']), float(p['LATITUDE'])
    if lat > LAT_MAX or lat < LAT_MIN:
        continue
    sx, sy = shift_pt(lon, lat)
    pt = Point(sx, sy)
    cand = tree.query(pt.buffer(0.25))
    best, bd = None, 1e9
    for ci in cand:
        d = units[ci]['sgeom'].distance(pt)
        if d < bd:
            best, bd = ci, d
    if best is None or bd > 0.25:
        continue
    nm = p['NAME_RU'] if isinstance(p['NAME_RU'], str) else p['NAME']
    nm = C.RENAME.get(nm, nm)
    pop = float(p['POP_MAX'] or 0)
    cap = 1 if str(p['FEATURECLA']).startswith('Admin-0 capital') else 0
    city = dict(name=nm, pop=pop, x=sx, y=sy, cap=cap, adm0=p['ADM0_A3'])
    units[best]['cities'].append(city)
    units[best]['pop'] += pop
    city_list.append(city)

# ---- clustering --------------------------------------------------------------------------------
groups = collections.defaultdict(list)
for u in units:
    key = f"{u['tag']}|{u['adm0']}" + (f"|{u['sp']}" if u['sp'] else '')
    u['gkey'] = key
    groups[key].append(u)

MIN_KEEP = 3000.0


def unit_adjacency(us):
    """returns dict (i,j)->approx shared border length (deg) for units in same group"""
    adj = {}
    if len(us) < 2:
        return adj
    t = STRtree([u['sgeom'] for u in us])
    for i, u in enumerate(us):
        b = u['sgeom'].buffer(0.03)
        for j in t.query(b):
            if j <= i:
                continue
            try:
                ia = b.intersection(us[j]['sgeom']).area
            except Exception:
                ia = 0
            ln = ia / 0.03
            if ln > 0.04:
                adj[(i, int(j))] = ln
    return adj


def components(n, edges):
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for (i, j) in edges:
        parent[find(i)] = find(j)
    comps = collections.defaultdict(list)
    for i in range(n):
        comps[find(i)].append(i)
    return list(comps.values())


def cluster_component(us, idxs, adj, k, wts, min_area=5000.0):
    """agglomerative merge of units idxs into k clusters; returns list of lists"""
    clusters = {i: [i] for i in idxs}
    w = {i: wts[i] for i in idxs}
    per = {i: us[i]['sgeom'].length for i in idxs}
    cadj = collections.defaultdict(dict)
    for (i, j), ln in adj.items():
        if i in clusters and j in clusters:
            cadj[i][j] = cadj[i].get(j, 0) + ln
            cadj[j][i] = cadj[j].get(i, 0) + ln
    area = {i: us[i]['area'] for i in idxs}

    def do_merge(c, n_):
        clusters[n_] += clusters.pop(c)
        w[n_] += w.pop(c)
        area[n_] += area.pop(c)
        per[n_] = per[n_] + per[c] - 2 * cadj[c][n_]
        for o, ln in cadj[c].items():
            if o == n_:
                continue
            cadj[n_][o] = cadj[n_].get(o, 0) + ln
            cadj[o][n_] = cadj[o].get(n_, 0) + ln
            del cadj[o][c]
        del cadj[n_][c]
        del cadj[c]

    # tiny units (city-states) are always merged into the neighbour with the longest shared border
    while True:
        tiny = [c for c in clusters if area[c] < min_area and cadj[c]]
        if not tiny or len(clusters) <= 1:
            break
        c = min(tiny, key=lambda c: area[c])
        n_ = max(cadj[c].items(), key=lambda t: t[1])[0]
        do_merge(c, n_)
    while len(clusters) > k:
        order = sorted(clusters.keys(), key=lambda c: w[c])
        merged = False
        for c in order:
            if not cadj[c]:
                continue
            best, bs = None, 1e18
            for n_, ln in cadj[c].items():
                frac = ln / max(1e-9, per[c])
                score = (w[c] + w[n_]) / (0.25 + min(1.0, frac))
                if score < bs:
                    best, bs = n_, score
            do_merge(c, best)
            merged = True
            break
        if not merged:
            break
    return list(clusters.values())


regions = []   # dict(units=[...], tag, adm0, sp)
dropped = []
for key, us in sorted(groups.items()):
    prm = C.PARAMS.get(key, {})
    sep = prm.get('sep', 6000.0)
    link = prm.get('link', 3.0)
    tot_area = sum(u['area'] for u in us)
    tot_pop = sum(u['pop'] for u in us)
    if tot_area < MIN_KEEP and key not in C.KEEP_SMALL:
        dropped.append((key, round(tot_area)))
        continue
    kk = C.K.get(key)
    if kk is None:
        base = '|'.join(key.split('|')[:2])
        kk = C.K.get(base) if not us[0]['sp'] else None
    if kk is None:
        kk = max(1, int(round(0.7 * math.sqrt(tot_area / 200e3) + 0.5 * math.sqrt(tot_pop / 3e6))))
        print('  default K for', key, '->', kk, 'area', round(tot_area), 'pop', round(tot_pop))
    wts = [0.35 * u['area'] / max(1, tot_area) + 0.65 * (u['pop'] / tot_pop if tot_pop > 0 else 1.0 / len(us)) + 1e-6 for u in us]
    adj = unit_adjacency(us)
    # link small detached components to the nearest unit
    for _ in range(4):
        comps = components(len(us), adj.keys())
        if len(comps) == 1:
            break
        changed = False
        for comp in comps:
            ca = sum(us[i]['area'] for i in comp)
            if ca >= sep:
                continue
            cs = set(comp)
            best, bd = None, 1e9
            for i in comp:
                for j in range(len(us)):
                    if j in cs:
                        continue
                    d = us[i]['sgeom'].distance(us[j]['sgeom'])
                    if d < bd:
                        best, bd = (i, j), d
            if best and bd <= link:
                a, b = min(best), max(best)
                adj[(a, b)] = 0.05
                changed = True
        if not changed:
            break
    comps = components(len(us), adj.keys())
    keep = []
    for comp in comps:
        ca = sum(us[i]['area'] for i in comp)
        if ca < MIN_KEEP and len(comps) > 1 and key not in C.KEEP_SMALL:
            dropped.append((key + ':' + us[comp[0]]['name'], round(ca)))
            continue
        keep.append(comp)
    if not keep:
        continue
    # allocate k among components
    cw = [sum(wts[i] for i in comp) for comp in keep]
    tw = sum(cw)
    alloc = [max(1, min(len(comp), int(round(kk * w_ / tw)))) for comp, w_ in zip(keep, cw)]
    # adjust biggest to hit total if possible
    diff = kk - sum(alloc)
    order = sorted(range(len(keep)), key=lambda i: -cw[i])
    gi = 0
    while diff != 0 and gi < 50:
        i = order[gi % len(order)]
        if diff > 0 and alloc[i] < len(keep[i]):
            alloc[i] += 1
            diff -= 1
        elif diff < 0 and alloc[i] > 1:
            alloc[i] -= 1
            diff += 1
        gi += 1
    for comp, k_ in zip(keep, alloc):
        for cl in cluster_component(us, comp, adj, k_, wts, prm.get('min_area', 5000.0)):
            regions.append(dict(units=[us[i] for i in cl], tag=us[0]['tag'], adm0=us[0]['adm0'], sp=us[0]['sp'], gkey=key))
print('regions from units:', len(regions))
print('dropped:', dropped[:400])

# ---- dissolve -----------------------------------------------------------------------------------
print('dissolving ...')
final = []
for rg in regions:
    g = clean(unary_union([u['geom'] for u in rg['units']]))
    if g is None:
        continue
    ps = sorted(polys(g), key=lambda p: -p.area)
    keep = [ps[0]] + [p for p in ps[1:] if km2(p) >= 450]
    keep = [Polygon(p.exterior, [h for h in p.interiors if km2(Polygon(h)) > 800]) for p in keep]
    g = MultiPolygon(keep) if len(keep) > 1 else keep[0]
    cities = sorted([c for u in rg['units'] for c in u['cities']], key=lambda c: -c['pop'])
    us = rg['units']
    big = max(us, key=lambda u: u['area'])
    fixed = [u['fixed_name'] for u in us if u.get('fixed_name')]
    if fixed:
        name = fixed[0]
    elif us[0].get('was_split') and len(us) == 1 and not (cities and cities[0]['pop'] >= 150000):
        name = us[0]['name_ru']
    elif len(us) == 1 and not us[0].get('was_split') and (not cities or rg['adm0'] in C.UNIT_NAMES or us[0]['area'] > 450000):
        name = us[0]['name_ru']
    elif cities and (cities[0]['pop'] >= 40000 or len(us) > 1):
        name = cities[0]['name']
    else:
        name = big['name_ru']
    final.append(dict(geom=g, tag=rg['tag'], adm0=rg['adm0'], sp=rg['sp'], name=name, cities=cities,
                      pop=sum(u['pop'] for u in us), area=km2(g), alt=big['name_ru']))
for c in circle_geoms:
    final.append(dict(geom=c['geom'], tag=c['tag'], adm0='ISL_' + c['key'], sp=c['key'], name=c['name'],
                      cities=[dict(name=c['name'], pop=150000, x=shift_pt(c['lon'], c['lat'])[0], y=c['lat'], cap=0, adm0='')],
                      pop=150000, area=km2(c['geom']), alt=c['name'], circle=True))

# unique names
seen = collections.Counter()
for f in final:
    seen[f['name']] += 1
used = collections.Counter()
for f in final:
    if seen[f['name']] > 1:
        if f['alt'] != f['name'] and seen.get(f['alt'], 0) == 0 and used[f['alt']] == 0:
            f['name'] = f['alt']
        used[f['name']] += 1
for f in final:
    f['name'] = C.NAME_FIX.get(f"{f['tag']}:{f['name']}", C.NAME_FIX.get(f['name'], f['name']))
dups = [n for n, c in collections.Counter(f['name'] for f in final).items() if c > 1]
print('duplicate names:', dups)
for i, f in enumerate(final):
    f['id'] = i
print('final regions:', len(final))

# ---- project + topology simplification via mapshaper ------------------------------------------
print('projecting ...')
feats = []
for f in final:
    f['pgeom'] = project(f['geom'])
    feats.append(dict(type='Feature', properties=dict(rid=f['id']), geometry=mapping(f['pgeom'])))
src = os.path.join(WORK, 'regions_src.geojson')
with open(src, 'w') as fh:
    json.dump(dict(type='FeatureCollection', features=feats), fh)
topo_path = os.path.join(WORK, 'regions.topojson')
cmd = [MAPSHAPER, '-i', src, '-clean', '-simplify', 'weighted', 'interval=9', 'keep-shapes', '-clean',
       '-o', 'format=topojson', 'no-quantization', 'precision=1', topo_path]
print(' '.join(cmd))
subprocess.run(cmd, check=True)
topo = json.load(open(topo_path))
arcs = [[(int(round(x)), int(round(y))) for x, y in a] for a in topo['arcs']]
obj = list(topo['objects'].values())[0]


def dp(points, tol):
    """Douglas-Peucker on list of (x,y)"""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        md, mi = -1, -1
        for i in range(a + 1, b):
            px, py = points[i]
            if L == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dx * (ay - py) - (ax - px) * dy) / L
            if d > md:
                md, mi = d, i
        if md > tol:
            keep[mi] = True
            stack.append((a, mi))
            stack.append((mi, b))
    return [p for p, k in zip(points, keep) if k]


def arc_lo(a, tol):
    closed = a[0] == a[-1]
    s = dp(a, tol)
    if closed and len(s) < 4:
        # keep a triangle/quad for small closed rings
        n = len(a)
        idx = sorted(set([0, n // 3, (2 * n) // 3, n - 1]))
        s = [a[i] for i in idx]
    return s


arcs_lo = [arc_lo(a, 28) for a in arcs]
print('arcs', len(arcs), 'pts hi', sum(len(a) for a in arcs), 'pts lo', sum(len(a) for a in arcs_lo))

# region rings + arc ownership
arc_use = collections.defaultdict(list)
geoms_by_rid = {}
for g in obj['geometries']:
    rid = g['properties']['rid']
    if g['type'] == 'Polygon':
        pl = [g['arcs']]
    elif g['type'] == 'MultiPolygon':
        pl = g['arcs']
    else:
        continue
    geoms_by_rid[rid] = pl
    for poly in pl:
        for ring in poly:
            for ai in ring:
                arc_use[ai if ai >= 0 else ~ai].append(rid)
missing = [f['id'] for f in final if f['id'] not in geoms_by_rid]
print('regions lost in simplification:', [(f['name'], f['tag'], round(f['area'])) for f in final if f['id'] in missing])


def arc_len(a):
    return sum(math.hypot(a[i + 1][0] - a[i][0], a[i + 1][1] - a[i][1]) for i in range(len(a) - 1))


adjlen = collections.defaultdict(float)
arc_owner = []
for i, a in enumerate(arcs):
    us_ = arc_use.get(i, [])
    if len(us_) >= 2 and us_[0] != us_[1]:
        key = (min(us_[0], us_[1]), max(us_[0], us_[1]))
        adjlen[key] += arc_len(a)
        arc_owner.append([us_[0], us_[1]])
    elif len(us_) >= 1:
        arc_owner.append([us_[0], -1])
    else:
        arc_owner.append([-1, -1])


def ring_coords(ring, arcset):
    pts = []
    for ai in ring:
        a = arcset[ai] if ai >= 0 else list(reversed(arcset[~ai]))
        if pts:
            pts += a[1:]
        else:
            pts += a
    return pts


# simplified projected geometry per region (for label points, raster, lookup)
for f in final:
    pl = geoms_by_rid.get(f['id'])
    if not pl:
        f['sgeo'] = None
        continue
    ps = []
    for poly in pl:
        rings = [ring_coords(r_, arcs) for r_ in poly]
        if len(rings[0]) < 4:
            continue
        try:
            p = Polygon(rings[0], [h for h in rings[1:] if len(h) >= 4])
            if not p.is_valid:
                p = p.buffer(0)
            ps += polys(p)
        except Exception as e:
            print('bad polygon', f['name'], e)
    f['sgeo'] = MultiPolygon(ps) if len(ps) > 1 else (ps[0] if ps else None)
final_ok = [f for f in final if f['sgeo'] is not None]


def region_at(lon, lat, maxd=150):
    x, y = proj_pt(lon, lat)
    pt = Point(x, y)
    best, bd = None, 1e18
    for f in final_ok:
        d = f['sgeo'].distance(pt)
        if d < bd:
            best, bd = f, d
            if d == 0:
                break
    return best if bd <= maxd else None


# ---- terrain -------------------------------------------------------------------------------------
print('terrain ...')
geo = gpd.read_file(os.path.join(NE, 'ne_10m_geography_regions_polys', 'ne_10m_geography_regions_polys.shp'))
mtn, des, plat = [], [], []
for _, r in geo.iterrows():
    g = clean(r.geometry)
    if g is None:
        continue
    cls = r['FEATURECLA']
    if cls in ('Range/mtn', 'Desert', 'Plateau', 'Foothills'):
        try:
            sg = clean(shift(g))
        except Exception:
            sg = None
        if sg is None:
            continue
        (mtn if cls == 'Range/mtn' else des if cls == 'Desert' else plat).append(sg)
mtn_u = unary_union(mtn).simplify(0.05)
des_u = unary_union(des).simplify(0.05)
plat_u = unary_union(plat).simplify(0.05)

JUNGLE = [(-78, -15, -45, 7), (8, -6, 30, 6), (-12, 4, 10, 8), (92, -11, 153, 20), (-92, 7, -76, 18), (99, 8, 110, 23), (43, -26, 51, -12)]
MARSH = [(24.5, 51.2, 30.0, 53.0)]


def in_boxes(x, y, boxes):
    return any(a <= x <= c and b <= y <= d for a, b, c, d in boxes)


for f in final_ok:
    g = f['geom'].simplify(0.05)
    a = max(1e-9, g.area)
    try:
        fm = g.intersection(mtn_u).area / a
        fd = g.intersection(des_u).area / a
        fp = g.intersection(plat_u).area / a
    except Exception:
        fm = fd = fp = 0
    c = g.representative_point()
    lon, lat = c.x + LON0, c.y
    if lon > 180:
        lon -= 360
    top = max([ci['pop'] for ci in f['cities']] or [0])
    if f.get('circle'):
        t = 'plains' if f['sp'] in ('malta', 'singapore', 'hongkong', 'gibraltar') else 'jungle'
        if f['sp'] in ('gibraltar', 'hongkong', 'singapore', 'malta'):
            t = 'urban'
        if f['sp'] in ('azores', 'bermuda', 'midway', 'wake', 'iwojima'):
            t = 'hills'
    elif f['area'] < 7000 and top > 6e6:
        t = 'urban'
    elif fm > 0.5:
        t = 'mountain'
    elif fd > 0.45:
        t = 'desert'
    elif fm > 0.22 or fp > 0.6:
        t = 'hills'
    elif in_boxes(lon, lat, MARSH):
        t = 'marsh'
    elif in_boxes(lon, lat, JUNGLE) and fd < 0.2:
        t = 'jungle'
    elif lat > 66 or (lat > 60 and (lon > 60 or lon < -60)):
        t = 'tundra'
    elif (lat > 56 and (lon > 28 or lon < -50)) or (lat > 58 and 4 < lon <= 32) or (48 < lat <= 56 and 85 < lon < 140) or (45 < lat < 56 and -130 < lon < -115):
        t = 'forest'
    else:
        t = 'plains'
    f['terrain'] = t
print(collections.Counter(f['terrain'] for f in final_ok))

# ---- raster: sea zones ----------------------------------------------------------------------------
print('sea zones ...')
CELL = 20
GW, GH = MAP_W // CELL, int(math.ceil(MAP_H / CELL))
tr = Affine(CELL, 0, 0, 0, CELL, 0)
shapes_ = [(mapping(f['pgeom']), f['id'] + 1) for f in final_ok]
land_touch = rasterio.features.rasterize(shapes_, out_shape=(GH, GW), transform=tr, fill=0, all_touched=True, dtype='int32')
water = land_touch == 0
zone = np.full((GH, GW), -1, dtype=np.int32)
dist = np.full((GH, GW), np.inf)
heap = []
seed_cells = []
for zi, (nm, lon, lat) in enumerate(C.SEAS):
    x, y = proj_pt(lon, lat)
    cx, cy = int(x // CELL) % GW, min(GH - 1, max(0, int(y // CELL)))
    if not water[cy, cx]:
        found = False
        for rad in range(1, 30):
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    yy, xx = cy + dy, (cx + dx) % GW
                    if 0 <= yy < GH and water[yy, xx]:
                        cx, cy, found = xx, yy, True
                        break
                if found:
                    break
            if found:
                break
        print('  seed moved', nm)
    seed_cells.append((cx, cy))
    dist[cy, cx] = 0
    zone[cy, cx] = zi
    heapq.heappush(heap, (0.0, cy, cx, zi))
# latitude scale for x steps (projected map: horizontal distances shrink with latitude)
row_lat = np.array([0.0] * GH)
for gy in range(GH):
    yy = (gy + 0.5) * CELL
    my = YTOP - yy / R
    lat = (math.atan(math.exp(my / 1.25)) - math.pi / 4) / 0.4
    row_lat[gy] = lat
xs = np.cos(row_lat)
ys_scale = 1.0  # approx
NB = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
while heap:
    d, cy, cx, zi = heapq.heappop(heap)
    if d > dist[cy, cx] or zone[cy, cx] != zi:
        continue
    for dy, dx in NB:
        yy, xx = cy + dy, (cx + dx) % GW
        if yy < 0 or yy >= GH or not water[yy, xx]:
            continue
        if dx != 0 and dy != 0:
            if not water[cy, xx] or not water[yy, cx]:
                continue
        step = math.hypot(dx * xs[cy], dy * (0.8 + 0.2 * xs[cy]))
        nd = d + step
        if nd < dist[yy, xx]:
            dist[yy, xx] = nd
            zone[yy, xx] = zi
            heapq.heappush(heap, (nd, yy, xx, zi))
true_zone = zone.copy()
# fill everything else (land + unreached water) with nearest zone for seamless polygons
unassigned = zone < 0
idx = ndimage.distance_transform_edt(unassigned, return_distances=False, return_indices=True)
zone_full = zone[idx[0], idx[1]]
# unreached water gets nearest zone too (fjords, inland seas)
true_zone = np.where(water & (true_zone < 0), zone_full, true_zone)

# zone adjacency from raster
zadj = collections.defaultdict(int)
for dy, dx in [(0, 1), (1, 0)]:
    a = true_zone
    b = np.roll(true_zone, -dx, axis=1) if dx else np.vstack([true_zone[1:], np.full((1, GW), -1, dtype=np.int32)])
    m = (a >= 0) & (b >= 0) & (a != b)
    pa, pb = a[m], b[m]
    for u_, v_ in zip(pa.tolist(), pb.tolist()):
        zadj[(min(u_, v_), max(u_, v_))] += 1
zone_names = [s[0] for s in C.SEAS]
sea_adj = collections.defaultdict(set)
for (a, b), cnt in zadj.items():
    if cnt >= 3:
        sea_adj[a].add(b)
        sea_adj[b].add(a)
sea_links = []
for a, b, ctrl in C.SEA_LINKS:
    ia, ib = zone_names.index(a), zone_names.index(b)
    sea_adj[ia].add(ib)
    sea_adj[ib].add(ia)
    if ctrl:
        rg = region_at(ctrl[0], ctrl[1], 300)
        sea_links.append([ia, ib, rg['id'] if rg else -1])
        print('  strait', a, '<->', b, 'controlled by', rg['name'] if rg else None)

# coastal adjacency: land cells next to water cells
coast = collections.defaultdict(lambda: collections.Counter())
lt = land_touch
for dy, dx in NB:
    sh = np.roll(true_zone, (-dy, -dx), axis=(0, 1))
    if dy == 1:
        sh[-1, :] = -1
    if dy == -1:
        sh[0, :] = -1
    m = (lt > 0) & (sh >= 0)
    for rid1, z in zip(lt[m].tolist(), sh[m].tolist()):
        coast[rid1 - 1][z] += 1
# also water cells sitting inside all_touched land cells are invisible; good enough.

# sea polygons
zshapes = collections.defaultdict(list)
for geom_, val in rasterio.features.shapes(zone_full.astype('int32'), transform=tr):
    zshapes[int(val)].append(shape(geom_))
sfeats = []
for zi in range(len(C.SEAS)):
    g = unary_union(zshapes[zi])
    sfeats.append(dict(type='Feature', properties=dict(zid=zi), geometry=mapping(g)))
ssrc = os.path.join(WORK, 'seas_src.geojson')
json.dump(dict(type='FeatureCollection', features=sfeats), open(ssrc, 'w'))
sout = os.path.join(WORK, 'seas.geojson')
subprocess.run([MAPSHAPER, '-i', ssrc, '-simplify', 'dp', 'interval=70', 'keep-shapes', '-o', 'precision=1', sout], check=True)
seas_geo = json.load(open(sout))
sea_polys = {}
for ft in seas_geo['features']:
    g = ft['geometry']
    pl = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    sea_polys[ft['properties']['zid']] = [[[int(round(v)) for pt in ring for v in pt] for ring in poly] for poly in pl]

# ---- lakes / rivers (visual only) ----------------------------------------------------------------
lakes_out = []
try:
    lk = gpd.read_file(os.path.join(NE, 'ne_50m_lakes', 'ne_50m_lakes.shp'))
    for _, r in lk.iterrows():
        if r['scalerank'] > 1:
            continue
        g = clean(r.geometry)
        if g is None:
            continue
        g = clean(shift(g))
        if g is None:
            continue
        pg = project(g).simplify(10)
        for p in polys(pg):
            if p.area > 2500:
                lakes_out.append([int(round(v)) for pt in p.exterior.coords for v in pt])
except Exception as e:
    print('lakes failed', e)
rivers_out = []
try:
    rv = gpd.read_file(os.path.join(NE, 'ne_50m_rivers_lake_centerlines', 'ne_50m_rivers_lake_centerlines.shp'))
    for _, r in rv.iterrows():
        if r['scalerank'] > 4 or r.geometry is None:
            continue
        g = r.geometry
        lines = [g] if g.geom_type == 'LineString' else list(g.geoms)
        for ln in lines:
            cs = [shift_pt(x, y) for x, y in ln.coords if LAT_MIN < y < LAT_MAX]
            if len(cs) < 2:
                continue
            # break lines at the seam
            seg = [cs[0]]
            for a, b in zip(cs, cs[1:]):
                if abs(b[0] - a[0]) > 90:
                    if len(seg) > 1:
                        pl = project(LineString(seg)).simplify(12)
                        rivers_out.append([int(round(v)) for pt in pl.coords for v in pt])
                    seg = [b]
                else:
                    seg.append(b)
            if len(seg) > 1:
                pl = project(LineString(seg)).simplify(12)
                rivers_out.append([int(round(v)) for pt in pl.coords for v in pt])
except Exception as e:
    print('rivers failed', e)

# ---- output ------------------------------------------------------------------------------------
print('writing ...')
id_map = {}
out_regions = []
for f in final_ok:
    id_map[f['id']] = len(out_regions)
    out_regions.append(f)


def enc_arc(a):
    out = [a[0][0], a[0][1]]
    for i in range(1, len(a)):
        out += [a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1]]
    return out


strait_pairs = []
for (p1, p2) in C.LAND_STRAITS:
    r1, r2 = region_at(*p1), region_at(*p2)
    if r1 and r2 and r1 is not r2:
        strait_pairs.append((id_map[r1['id']], id_map[r2['id']]))
        print('  land strait', r1['name'], '<->', r2['name'])
    else:
        print('  !! strait unresolved', p1, p2, r1 and r1['name'], r2 and r2['name'])

R_out = []
for f in out_regions:
    rid = id_map[f['id']]
    sg = f['sgeo']
    big = max(polys(sg), key=lambda p: p.area)
    try:
        lp = polylabel(big, tolerance=8)
    except Exception:
        lp = big.representative_point()
    bb = sg.bounds
    cities = []
    for c in f['cities'][:3]:
        if c['pop'] < 250000 and not c['cap'] and cities:
            continue
        x, y = (c['x'] + 180.0) * 100.0, (YTOP - float(miller(c['y']))) * R
        cities.append([c['name'], int(c['pop']), int(round(x)), int(round(y)), c['cap']])
    adj = []
    for (a, b), ln in adjlen.items():
        if a == f['id'] and b in id_map:
            adj.append([id_map[b], int(round(ln))])
        elif b == f['id'] and a in id_map:
            adj.append([id_map[a], int(round(ln))])
    st = [b if a == rid else a for a, b in strait_pairs if rid in (a, b)]
    seas_ = sorted([[z, n] for z, n in coast.get(f['id'], {}).items()], key=lambda t: -t[1])
    R_out.append(dict(
        id=rid, n=f['name'], t=f['tag'], a=f['adm0'], sp=f['sp'],
        p=geoms_by_rid[f['id']],
        c=[int(round(lp.x)), int(round(lp.y))],
        bb=[int(math.floor(bb[0])), int(math.floor(bb[1])), int(math.ceil(bb[2])), int(math.ceil(bb[3]))],
        ar=int(round(f['area'])), tr=f['terrain'], pop=int(f['pop']),
        ci=cities, adj=sorted(adj), st=st, sea=seas_,
    ))
S_out = []
for zi, (nm, lon, lat) in enumerate(C.SEAS):
    cx, cy = seed_cells[zi]
    S_out.append(dict(id=zi, n=nm, c=[int((cx + 0.5) * CELL), int((cy + 0.5) * CELL)],
                      adj=sorted(sea_adj[zi]), p=sea_polys.get(zi, [])))
arc_owner_out = [[id_map.get(a, -1) if a >= 0 else -1, id_map.get(b, -1) if b >= 0 else -1] for a, b in arc_owner]
data = dict(w=MAP_W, h=MAP_H, lon0=LON0, cut=CUT_LON, latMax=LAT_MAX,
            arcs=[enc_arc(a) for a in arcs], arcsLo=[enc_arc(a) for a in arcs_lo], arcOwner=arc_owner_out,
            regions=R_out, seas=S_out, seaLinks=sea_links, lakes=lakes_out, rivers=rivers_out)
with open(OUT, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
print('done:', OUT, os.path.getsize(OUT) // 1024, 'KB; regions', len(R_out), 'seas', len(S_out))
tags = collections.Counter(r['t'] for r in R_out)
print(sorted(tags.items(), key=lambda t: -t[1]))
