// Panels: army (general staff, recruitment, templates, divisions), air force, navy.
import { PANELS, A } from './app.js';
import { esc, ic, flag, bar, btn, stepper, sw } from './dom.js';
import { tabsHtml, eqName } from './panels1.js';
import { REG, NREG, SEA, distKm } from '../core/world.js';
import { EQ, BAT, BAT_KEYS, SUPC, SUPC_KEYS, SHIP, SHIP_KEYS, AIR_EQ, PLANE, MISSIONS, MAX_BATS, MAX_WIDTH, TIER_ROMAN } from '../data/equip.js';
import { fmtNum, pct } from '../core/util.js';
import { cn, enemies, atWar, friendly, neighbours, sameSide } from '../core/diplo.js';
import { divsOf, divsIn, calcTemplate, tplFill, trainDays, queueTraining, hostileDivs } from '../core/land.js';
import { STANCES, frontOrder } from '../core/staff.js';
import { actStop, actSetManual, actDisband, actSaveTemplate, actDeleteTemplate, templateWidth } from '../core/actions.js';
import { createWing, disbandWing, airfields, baseFree, planeRange, WING_SIZE, BASE_CAP, nukeStrike, nukeBlocker, autoWings } from '../core/air.js';
import { fleetSize, fleetPower, setFleetMission, mergeFleets, splitFleet, FLEET_MIS, shipsTotal, dominance } from '../core/navy.js';
import { regionSupplyCap } from '../core/supply.js';

// ---- army ------------------------------------------------------------------------------------------
function frontInfo(G, c) {
  const out = {};
  for (let i = 0; i < NREG; i++) {
    const ctl = G.reg[i].c;
    if (ctl === c.tag || friendly(G, c.tag, ctl)) continue;
    let touch = false;
    for (const j of REG[i].adj) { const o = G.reg[j].c; if (o === c.tag || friendly(G, c.tag, o)) { touch = true; break; } }
    if (!touch) continue;
    const f = out[ctl] || (out[ctl] = { tag: ctl, regs: 0, theirs: 0, ours: new Set(), war: atWar(G, c.tag, ctl) });
    f.regs++;
    for (const d of divsIn(G, i)) if (d.o !== c.tag) f.theirs++;
    for (const j of REG[i].adj) if (G.reg[j].c === c.tag || friendly(G, c.tag, G.reg[j].c)) for (const d of divsIn(G, j)) if (d.o === c.tag) f.ours.add(d.id);
  }
  return Object.values(out).sort((a, b) => (b.war - a.war) || (b.theirs - a.theirs));
}
function statRow(s) {
  return `<div class="kv" style="font-size:12.5px;grid-template-columns:1fr auto 1fr auto;gap:1px 8px"><span>Атака по пехоте</span><span>${s.sa.toFixed(0)}</span><span>Атака по технике</span><span>${s.ha.toFixed(0)}</span>
    <span>Оборона</span><span>${s.df.toFixed(0)}</span><span>Прорыв</span><span>${s.br.toFixed(0)}</span><span>Организация</span><span>${s.org.toFixed(0)}</span><span>Прочность</span><span>${s.hp.toFixed(0)}</span>
    <span>Скорость</span><span>${s.spd.toFixed(1)} км/ч</span><span>Ширина фронта</span><span>${s.w.toFixed(0)}</span><span>Броня / пробитие</span><span>${s.arm.toFixed(0)} / ${s.ap.toFixed(0)}</span><span>Снабжение</span><span>${s.sup.toFixed(2)}</span>
    <span>Личный состав</span><span>${fmtNum(s.mp)}</span><span>Стоимость</span><span>${Math.round(s.cost)}</span></div>`;
}
PANELS.army = {
  title: 'Армия',
  render(app, tab = 'staff') {
    const G = app.G, c = app.me();
    const divs = divsOf(G, c.tag);
    let h = tabsHtml('army', { staff: 'Генштаб', recruit: 'Набор', tpl: 'Шаблоны', divs: 'Дивизии' }, tab);
    if (tab === 'staff') {
      let inBattle = 0, low = 0, man = 0, sea = 0;
      for (const d of divs) { if (G.battles[d.r] || (d.path.length && hostileDivs(G, d.path[0], d.o).length)) inBattle++; if (d.sup < 0.7) low++; if (d.man) man++; if (d.sea || d.tr) sea++; }
      h += `<div class="li" style="border:0"><div class="grow"><span class="nm">Генштаб управляет войсками</span><small>Штаб распределяет дивизии по фронтам и атакует по вашим установкам</small></div>${sw(c.staff.auto, 'staffauto')}</div>`;
      h += `<div class="grid2" style="font-size:13px"><div class="cardx">Дивизий: <b>${divs.length}</b><br>В бою: <b>${inBattle}</b></div><div class="cardx">Плохое снабжение: <b class="${low ? 'neg' : ''}">${low}</b><br>Ручное управление: <b>${man}</b>${sea ? `<br>В море / погрузка: <b>${sea}</b>` : ''}</div></div>`;
      if (man) h += btn(`${ic('auto')} Вернуть все дивизии Генштабу`, 'allauto', 'sm ghost wide');
      const fr = frontInfo(G, c);
      const wars = fr.filter((f) => f.war);
      h += `<h4>${ic('ws')} Фронты</h4>`;
      if (!wars.length) h += `<div class="muted">${enemies(G, c.tag).some((e) => G.ctr[e].alive) ? 'Сухопутного соприкосновения с противником нет. Для высадки за морем выберите войска в прибрежном регионе и нажмите на вражеский берег.' : 'Мы ни с кем не воюем.'}</div>`;
      for (const f of wars) {
        const o = frontOrder(c, f.tag);
        h += `<div class="cardx"><div class="ttl">${flag(f.tag)} ${esc(cn(G, f.tag))}<small>регионов: ${f.regs}</small></div><div class="desc">У линии фронта: наших <b>${f.ours.size}</b>, противника <b>${f.theirs}</b></div>
          <div class="seg" style="margin-top:5px">${Object.keys(STANCES).map((s) => `<button class="${o.st === s ? 'on' : ''}" data-a="stance|${f.tag}|${s}">${STANCES[s].name}</button>`).join('')}</div>
          <div class="row" style="margin-top:5px"><span class="muted">Приоритет</span>${stepper(o.pr, `prio|${f.tag}|-1`, `prio|${f.tag}|1`, o.pr <= 1, o.pr >= 3)}</div></div>`;
      }
      const peace = fr.filter((f) => !f.war && G.ctr[f.tag] && G.ctr[f.tag].alive);
      if (peace.length) {
        h += `<h4>${ic('fort')} Прикрытие границ</h4><p class="muted">Сколько войск держать на границе в мирное время. «Авто» — штаб решает сам по отношениям и угрозам.</p><div class="list">`;
        for (const f of peace.slice(0, 14)) {
          const o = c.staff.fronts[f.tag];
          const cur = !o ? 'a' : o.st === 'none' ? '0' : String(o.pr);
          const opt = [['a', 'Авто'], ['0', 'Нет'], ['1', 'Слабое'], ['2', 'Среднее'], ['3', 'Сильное']];
          h += `<div class="li" style="flex-wrap:wrap"><div class="grow"><span class="nm">${flag(f.tag)} ${esc(cn(G, f.tag))}</span><small>у границы: наших ${f.ours.size}, чужих ${f.theirs}</small></div><div class="seg">${opt.map(([k, n]) => `<button class="${cur === k ? 'on' : ''}" data-a="guard|${f.tag}|${k}">${n}</button>`).join('')}</div></div>`;
        }
        h += '</div>';
      }
      h += `<h4>${ic('ship')} Охрана побережья и столицы</h4><div class="row">${stepper(c.staff.coast, 'coast|-1', 'coast|1', c.staff.coast <= 0, c.staff.coast >= 3)}<span class="muted">Гарнизоны портов во время войны (0 — не выделять)</span></div>`;
    } else if (tab === 'recruit') {
      h += `<div class="kv"><span>${ic('mp')} Свободные призывники</span><span>${fmtNum(c.mp * 1000)}</span><span>Место развёртывания</span><span>${esc(app.deployR >= 0 && G.reg[app.deployR] && G.reg[app.deployR].c === c.tag ? REG[app.deployR].name : 'столица')}</span></div>`;
      h += `<div class="row" style="margin:6px 0">${btn(`${ic('target')} Выбрать место на карте`, 'deploy', 'sm ghost')}${app.deployR >= 0 ? btn('Сбросить', 'deploy0', 'sm ghost') : ''}</div>`;
      h += '<h4>Обучить дивизию</h4>';
      for (const k in c.tpl) {
        const t = c.tpl[k], s = t._s;
        const lack = Object.keys(s.need).filter((e) => (c.stock[e] || 0) < s.need[e]);
        const mpOk = c.mp >= s.mp / 1000;
        h += `<div class="cardx"><div class="ttl">${esc(t.name)}<small>${trainDays(c, t)} дн.</small></div><div class="desc">${Object.keys(t.bats).map((b) => `${BAT[b].name} ×${t.bats[b]}`).join(', ')}${t.sup.length ? ' + ' + t.sup.map((x) => SUPC[x].name.toLowerCase()).join(', ') : ''}</div>
          <div class="desc">Людей: ${fmtNum(s.mp)} · атака ${s.sa.toFixed(0)}/${s.ha.toFixed(0)} · оборона ${s.df.toFixed(0)} · ширина ${s.w.toFixed(0)}${lack.length ? `<br><span class="neg">На складе не хватает: ${lack.map((e) => EQ[e].short.toLowerCase()).join(', ')} — дивизия выйдет недоукомплектованной</span>` : ''}</div>
          <div class="row" style="margin-top:5px">${btn('Обучить', `train|${k}|1`, 'sm red', !mpOk)}${btn('×3', `train|${k}|3`, 'sm', !mpOk)}${btn('×10', `train|${k}|10`, 'sm', !mpOk)}</div></div>`;
      }
      h += `<h4>В обучении <small>${c.train.length}</small></h4>`;
      if (!c.train.length) h += '<div class="muted">Никто не обучается</div>';
      const grp = {};
      c.train.forEach((t, i) => { const key = t.tpl + ':' + Math.floor((t.days - t.p) / 10); (grp[key] || (grp[key] = { t, n: 0, idx: [] })).n++; grp[key].idx.push(i); });
      for (const key in grp) {
        const g = grp[key];
        const t = c.tpl[g.t.tpl];
        h += `<div class="cardx"><div class="ttl">${esc(t ? t.name : '?')} ×${g.n}<small>${g.t.days - g.t.p} дн.</small></div>${bar(g.t.p / g.t.days)}<div style="margin-top:4px">${btn('Отменить одну', `untrain|${g.idx[g.idx.length - 1]}`, 'sm ghost')}</div></div>`;
      }
    } else if (tab === 'tpl') {
      const ed = app.tplEdit;
      if (!ed) {
        h += '<p class="muted">Шаблон определяет состав дивизии. Изменение шаблона меняет все дивизии этого типа — им потребуется новое снаряжение.</p>';
        for (const k in c.tpl) {
          const t = c.tpl[k];
          let n = 0;
          for (const d of divs) if (d.t === k) n++;
          h += `<div class="cardx"><div class="ttl">${esc(t.name)}<small>дивизий: ${n} · укомпл. ${pct(tplFill(c, t))}</small></div><div class="desc">${Object.keys(t.bats).map((b) => `${BAT[b].name} ×${t.bats[b]}`).join(', ')}${t.sup.length ? ' + ' + t.sup.map((x) => SUPC[x].name.toLowerCase()).join(', ') : ''}</div>${statRow(t._s)}<div class="row" style="margin-top:5px">${btn('Изменить', `tedit|${k}`, 'sm')}${btn('Копировать', `tcopy|${k}`, 'sm ghost')}</div></div>`;
        }
      } else {
        const tmp = { name: ed.name, bats: ed.bats, sup: ed.sup, icon: 'inf' };
        const s = calcTemplate(c, tmp);
        const { w, n } = templateWidth(ed.bats);
        h += `<div class="cardx act"><div class="ttl">${esc(ed.name)}<small>${ed.key ? 'изменение' : 'новый шаблон'}</small></div><div class="desc">Батальонов ${n}/${MAX_BATS} · ширина ${w}/${MAX_WIDTH}</div>${statRow(s)}</div><h4>Батальоны</h4><div class="list">`;
        for (const b of BAT_KEYS) {
          const okk = c.unlocked[b] || b === 'art';
          if (!okk && !ed.bats[b]) continue;
          const v = ed.bats[b] || 0;
          h += `<div class="li"><div class="grow"><span class="nm">${BAT[b].name}</span><small>ширина ${BAT[b].w} · ${Object.keys(BAT[b].eq).map((e) => `${EQ[e].short.toLowerCase()} ${BAT[b].eq[e]}`).join(', ')}</small></div>${stepper(v, `tbat|${b}|-1`, `tbat|${b}|1`, v <= 0, !okk || n >= MAX_BATS || w + BAT[b].w > MAX_WIDTH)}</div>`;
        }
        h += '</div><h4>Роты поддержки</h4><div class="list">';
        for (const x of SUPC_KEYS) {
          if (!c.unlocked[x]) continue;
          h += `<div class="li"><div class="grow"><span class="nm">${SUPC[x].name}</span><small>${SUPC[x].desc}</small></div>${sw(ed.sup.includes(x), `tsup|${x}`)}</div>`;
        }
        h += `</div><div class="row" style="margin-top:10px;flex-wrap:wrap">${btn('Сохранить', 'tsave', 'red')}${btn('Отмена', 'tcancel', 'ghost')}${ed.key ? btn('Удалить', 'tdel', 'ghost') : ''}</div>`;
      }
    } else {
      const by = new Map();
      for (const d of divs) { if (d.sea) continue; (by.get(d.r) || by.set(d.r, []).get(d.r)).push(d); }
      const arr = Array.from(by.entries()).sort((a, b) => b[1].length - a[1].length);
      const atSea = divs.filter((d) => d.sea).length;
      if (atSea) h += `<p class="muted">В море: ${atSea} дивизий</p>`;
      h += '<div class="list">';
      for (const [r, list] of arr) {
        let org = 0, low = 0, mv = 0;
        for (const d of list) { org += d.org / c.tpl[d.t]._s.org; if (d.sup < 0.7) low++; if (d.path.length) mv++; }
        const cap = regionSupplyCap(G, r);
        h += `<div class="li"><div class="grow"><span class="nm">${esc(REG[r].name)} — ${list.length}</span><small>орг. ${pct(org / list.length)}${mv ? ` · на марше ${mv}` : ''}${low ? ` · <span class="neg">снабжение ${low}</span>` : ''}${G.battles[r] ? ' · <span class="neg">бой</span>' : ''} · ёмкость снабжения ${cap.toFixed(0)}</small></div>${btn('Показать', `selgo|${r}`, 'sm ghost')}</div>`;
      }
      h += '</div>';
    }
    return h;
  },
};
PANELS.sel = {
  title: (app) => `Выбранные дивизии: ${app.view.sel.divs.size}`,
  render(app) {
    const G = app.G, c = app.me();
    const ids = Array.from(app.view.sel.divs).filter((id) => G.divs[id]);
    if (!ids.length) return '<div class="empty">Ничего не выбрано. Нажмите на значок войск на карте.</div>';
    let h = `<div class="row" style="flex-wrap:wrap">${btn(`${ic('stop')} Стоп`, 'selstop', 'sm')}${btn(`${ic('auto')} Генштабу`, 'selauto|0', 'sm')}${btn(`${ic('lock')} Вручную`, 'selauto|1', 'sm')}${btn('Расформировать', 'seldisband', 'sm ghost')}</div>
      <div class="row" style="margin-top:6px;flex-wrap:wrap">${btn('Только танки и мото', 'selonly|fast', 'sm ghost')}${btn('Только пехота', 'selonly|inf', 'sm ghost')}${btn('Половина', 'selonly|half', 'sm ghost')}</div><div class="list" style="margin-top:6px">`;
    for (const id of ids) {
      const d = G.divs[id], t = c.tpl[d.t];
      const st = d.sea ? 'в море' : d.ret ? 'отступает' : d.path.length ? `→ ${REG[d.path[d.path.length - 1]].name}` : d.tr ? 'готовится к погрузке' : `окопалась (${Math.min(d.ent, 10)})`;
      h += `<div class="li"><div class="grow"><span class="nm">${esc(d.name)}</span><small>${esc(t.name)} · ${esc(REG[d.r].name)} · ${st}${d.man ? ' · вручную' : ''}${d.sup < 0.7 ? ' · <span class="neg">нет снабжения</span>' : ''}</small><div class="grid2" style="gap:4px">${bar(d.org / t._s.org, 'g')}${bar(d.str)}</div></div>${btn(ic('close'), `selrm|${id}`, 'sm ghost')}</div>`;
    }
    return h + '</div>';
  },
};
Object.assign(A, {
  stance: (app, tag, st) => { const c = app.me(); const o = c.staff.fronts[tag] || { st: 'hold', pr: 2 }; c.staff.fronts[tag] = { st, pr: o.pr }; },
  prio: (app, tag, d) => { const c = app.me(); const o = c.staff.fronts[tag] || { st: 'hold', pr: 2 }; c.staff.fronts[tag] = { st: o.st, pr: Math.max(1, Math.min(3, o.pr + Number(d))) }; },
  guard: (app, tag, k) => { const c = app.me(); if (k === 'a') delete c.staff.fronts[tag]; else if (k === '0') c.staff.fronts[tag] = { st: 'none', pr: 1 }; else c.staff.fronts[tag] = { st: 'hold', pr: Number(k) }; },
  coast: (app, d) => { const c = app.me(); c.staff.coast = Math.max(0, Math.min(3, c.staff.coast + Number(d))); },
  allauto: (app) => { const c = app.me(); for (const d of divsOf(app.G, c.tag)) d.man = 0; app.toast('Все дивизии переданы Генштабу', 'good'); },
  deploy: (app) => { const G = app.G, c = app.me(); app.pickRegion('Где развёртывать новые дивизии', (i) => G.reg[i].c === c.tag && G.reg[i].o === c.tag, (i) => { app.deployR = i; }); },
  deploy0: (app) => { app.deployR = -1; },
  train: (app, k, n) => {
    const c = app.me();
    let done = 0, err = null;
    for (let i = 0; i < Number(n); i++) { err = queueTraining(app.G, c, k, app.deployR ?? -1); if (err) break; done++; }
    app.toast(done ? `Начато обучение дивизий: ${done}` : err, done ? 'good' : 'bad');
  },
  untrain: (app, i) => { const c = app.me(); const t = c.train[Number(i)]; if (t) { c.train.splice(Number(i), 1); if (c.tpl[t.tpl]) c.mp += c.tpl[t.tpl]._s.mp / 1000; } },
  tedit: (app, k) => { const t = app.me().tpl[k]; app.tplEdit = { key: k, name: t.name, bats: { ...t.bats }, sup: t.sup.slice() }; },
  tcopy: (app, k) => { const t = app.me().tpl[k]; app.tplEdit = { key: null, name: t.name + ' (нов.)', bats: { ...t.bats }, sup: t.sup.slice() }; },
  tcancel: (app) => { app.tplEdit = null; },
  tbat: (app, b, d) => { const e = app.tplEdit; e.bats[b] = Math.max(0, (e.bats[b] || 0) + Number(d)); if (!e.bats[b]) delete e.bats[b]; },
  tsup: (app, x) => { const e = app.tplEdit; if (e.sup.includes(x)) e.sup = e.sup.filter((y) => y !== x); else if (e.sup.length < 4) e.sup.push(x); else app.toast('Не более четырёх рот поддержки', 'bad'); },
  tsave: (app) => { const e = app.tplEdit; const res = actSaveTemplate(app.G, app.me().tag, e.key, e.name, e.bats, e.sup); if (app.say(res)) app.tplEdit = null; },
  tdel: (app) => { const e = app.tplEdit; if (app.say(actDeleteTemplate(app.G, app.me().tag, e.key))) app.tplEdit = null; },
  selgo: (app, r) => {
    r = Number(r);
    const me = app.me();
    app.view.sel.divs = new Set(divsIn(app.G, r).filter((d) => d.o === me.tag && !d.ret).map((d) => d.id));
    app.view.sel.region = r;
    app.view.centerOn(r, Math.max(app.view.cam.s, 0.09));
    app.close();
    app.card = { type: 'sel' };
  },
  selrm: (app, id) => { app.view.sel.divs.delete(Number(id)); },
  selonly: (app, kind) => {
    const G = app.G, c = app.me();
    const ids = Array.from(app.view.sel.divs).filter((id) => G.divs[id]);
    let keep;
    if (kind === 'half') keep = ids.slice(0, Math.ceil(ids.length / 2));
    else keep = ids.filter((id) => { const s = c.tpl[G.divs[id].t]._s; return kind === 'fast' ? s.spd > 6 : s.spd <= 6; });
    app.view.sel.divs = new Set(keep);
  },
  seldisband: (app) => {
    const ids = Array.from(app.view.sel.divs);
    app.modal({ title: 'Расформировать дивизии?', text: `Будет расформировано дивизий: ${ids.length}. Снаряжение вернётся на склад.`, opts: [{ text: 'Расформировать', cls: 'red', fn: () => { app.say(actDisband(app.G, app.me().tag, ids)); app.clearSel(); app.close(); } }, { text: 'Отмена' }] });
  },
});

// ---- air -------------------------------------------------------------------------------------------
const MIS_OF = (t) => Object.keys(MISSIONS).filter((m) => MISSIONS[m].types.includes(t));
PANELS.air = {
  title: 'Авиация',
  render(app) {
    const G = app.G, c = app.me();
    const wings = G.wings.filter((w) => w.o === c.tag);
    let h = `<div class="row">${btn(`${ic('layers')} Аэродромы на карте`, 'mode|air', 'sm ghost')}${btn(`${ic('auto')} Сформировать все`, 'wingauto', 'sm ghost')}</div>`;
    h += '<h4>Самолёты на складе</h4><div class="list">';
    let any = false;
    for (const k of AIR_EQ) {
      const n = Math.floor(c.stock[k] || 0);
      if (!n && !c.eqTier[k]) continue;
      any = true;
      h += `<div class="li"><div class="grow"><span class="nm">${esc(eqName(c, k))}</span><small>на складе ${n} · дальность ${Math.round(planeRange(c, k))} км</small></div>${btn(`Крыло ${Math.min(n, WING_SIZE)}`, `wingnew|${k}`, 'sm', n < 10)}</div>`;
    }
    if (!any) h += '<div class="muted">Самолётов нет. Исследуйте авиацию и откройте линию на военных заводах.</div>';
    h += `</div><h4>Авиакрылья <small>${wings.length}</small></h4>`;
    if (!wings.length) h += '<div class="muted">Крыльев нет</div>';
    for (const w of wings) {
      const selw = app.view.sel.wing === w;
      h += `<div class="cardx ${selw ? 'act' : ''}"><div class="ttl">${esc(eqName(c, w.t))}<small>${Math.round(w.n)}/${w.max}</small></div><div class="desc">База: ${esc(REG[w.base].name)}${w.mis === 'bomb' && w.tgt >= 0 ? ` · цель: ${esc(REG[w.tgt].name)}` : ''}</div>
        <div class="seg" style="margin-top:5px">${MIS_OF(w.t).map((m) => `<button class="${w.mis === m ? 'on' : ''}" data-a="wingmis|${w.id}|${m}">${MISSIONS[m].name}</button>`).join('')}</div>
        <div class="row" style="margin-top:5px;flex-wrap:wrap">${btn('Радиус', `wingsel|${w.id}`, 'sm ghost')}${btn('Перебазировать', `wingbase|${w.id}`, 'sm ghost')}${w.mis === 'bomb' ? btn('Цель', `wingtgt|${w.id}`, 'sm ghost') : ''}${btn('Распустить', `wingdel|${w.id}`, 'sm ghost')}</div></div>`;
    }
    if (c.unlocked.nuke || c.nukes > 0) h += `<h4>${ic('nuke')} Атомное оружие</h4><div class="row"><div class="grow">Готовых бомб: <b>${c.nukes || 0}</b></div>${btn('Нанести удар', 'nuke', 'sm red', !(c.nukes > 0))}</div>`;
    h += `<p class="muted">Аэродром вмещает ${BASE_CAP} самолётов на уровень. Крыло действует в радиусе от своей базы: истребители борются за превосходство над полем боя, штурмовики наносят потери войскам, бомбардировщики разрушают заводы.</p>`;
    return h;
  },
};
const findWing = (app, id) => app.G.wings.find((w) => w.id === Number(id));
function bestField(G, c, near) {
  let best = -1, bs = -1e9;
  for (const i of airfields(G, c.tag)) {
    if (baseFree(G, i) < 20) continue;
    const s = G.reg[i].air * 2 + (i === c.cap ? 2 : 0) - (near >= 0 ? distKm(i, near) / 100 : 0);
    if (s > bs) { bs = s; best = i; }
  }
  return best;
}
Object.assign(A, {
  wingauto: (app) => { autoWings(app.G, app.me()); },
  wingnew: (app, k) => {
    const G = app.G, c = app.me();
    app.pickRegion(`Аэродром для нового крыла (${EQ[k].short})`, (i) => G.reg[i].air > 0 && G.reg[i].c === c.tag && baseFree(G, i) >= 10, (i) => {
      const w = createWing(G, c, k, Math.min(WING_SIZE, baseFree(G, i)), i);
      app.toast(w ? `Крыло сформировано: ${REG[i].name}` : 'Не удалось сформировать крыло', w ? 'good' : 'bad');
    });
  },
  wingmis: (app, id, m) => { const w = findWing(app, id); if (w) { w.mis = m; w.tgt = -1; } },
  wingsel: (app, id) => { const w = findWing(app, id); app.view.sel.wing = app.view.sel.wing === w ? null : w; if (w && app.view.sel.wing) app.view.centerOn(w.base, Math.min(app.view.cam.s, 0.05)); },
  wingbase: (app, id) => {
    const G = app.G, c = app.me(), w = findWing(app, id);
    if (!w) return;
    app.pickRegion('Новый аэродром для крыла', (i) => G.reg[i].air > 0 && (G.reg[i].c === c.tag || friendly(G, c.tag, G.reg[i].c)) && baseFree(G, i) >= w.n, (i) => { w.base = i; w.tgt = -1; app.toast(`Крыло перебазировано: ${REG[i].name}`, 'good'); });
  },
  wingtgt: (app, id) => {
    const G = app.G, c = app.me(), w = findWing(app, id);
    if (!w) return;
    app.pickRegion('Цель бомбардировок', (i) => atWar(G, c.tag, G.reg[i].c) && distKm(w.base, i) <= planeRange(c, w.t), (i) => { w.tgt = i; w.manualTgt = 1; app.toast(`Цель: ${REG[i].name}`, 'good'); });
  },
  wingdel: (app, id) => { const w = findWing(app, id); if (w) disbandWing(app.G, w); },
  nuke: (app) => {
    const G = app.G, c = app.me();
    app.pickRegion('Цель атомного удара', (i) => !nukeBlocker(G, c, i), (i) => { const err = nukeStrike(G, c, i); if (err) app.toast(err, 'bad'); });
  },
});
void bestField;

// ---- navy ------------------------------------------------------------------------------------------
PANELS.navy = {
  title: 'Флот',
  render(app) {
    const G = app.G, c = app.me();
    const fleets = G.fleets.filter((f) => f.o === c.tag);
    const tot = shipsTotal(G, c.tag);
    let h = `<div class="row">${btn(`${ic('layers')} Морская карта`, 'mode|nav', 'sm ghost')}</div>`;
    h += `<div class="kv" style="margin-top:6px"><span>Всего кораблей</span><span>${SHIP_KEYS.map((k) => `${SHIP[k].short} ${tot[k]}`).join(' · ')}</span><span>${ic('ship')} Транспорты</span><span>${Math.floor(c.convoys)}${c._convoyNeed ? ` (нужно ${Math.ceil(c._convoyNeed)})` : ''}</span><span>Работа конвоев</span><span class="${(c._convoyEff ?? 1) < 0.9 ? 'neg' : ''}">${pct(c._convoyEff ?? 1)}</span></div>`;
    h += `<h4>Флоты <small>${fleets.length}</small></h4>`;
    if (!fleets.length) h += '<div class="muted">Флота нет. Постройте верфи и заложите корабли в панели «Заводы → Верфи».</div>';
    for (const f of fleets) {
      const P = fleetPower(G, f);
      const where = f.zone === -1 ? `в порту: ${REG[f.port].name}${f.rep > 0 ? ` (ремонт ${f.rep} дн.)` : ''}` : f.zone === -2 ? `в пути → ${SEA[f.tgt].name}` : SEA[f.zone].name;
      const same = fleets.filter((x) => x !== f && x.zone === -1 && f.zone === -1 && x.port === f.port);
      h += `<div class="cardx ${app.view.sel.fleet === f ? 'act' : ''}"><div class="ttl">${esc(f.name)}<small>сила ${Math.round(P.surf + P.sub)}</small></div><div class="desc">${SHIP_KEYS.filter((k) => f.ships[k]).map((k) => `${SHIP[k].short} ${f.ships[k]}`).join(' · ') || 'нет кораблей'}</div><div class="desc">${esc(where)}</div>
        <div class="seg" style="margin-top:5px">${Object.keys(FLEET_MIS).map((m) => `<button class="${f.mis === m ? 'on' : ''}" data-a="fleetmis|${f.id}|${m}">${FLEET_MIS[m]}</button>`).join('')}</div>
        <div class="row" style="margin-top:5px;flex-wrap:wrap">${btn(`${ic('target')} Зона`, `fleetzone|${f.id}`, 'sm')}${fleetSize(f) > 1 && f.zone === -1 ? btn('Разделить', `fleetsplit|${f.id}`, 'sm ghost') : ''}${same.length ? btn('Объединить в порту', `fleetmerge|${f.id}`, 'sm ghost') : ''}${f.zone >= 0 ? btn('Показать', `fleetshow|${f.id}`, 'sm ghost') : ''}</div></div>`;
    }
    h += '<p class="muted">Патруль ищет боя и даёт господство на море (нужно для десантов). Рейдеры — прежде всего подлодки — топят чужие транспорты. Охрана конвоев защищает свои морские пути.</p>';
    return h;
  },
};
const findFleet = (app, id) => app.G.fleets.find((f) => f.id === Number(id));
Object.assign(A, {
  fleetzone: (app, id) => {
    const f = findFleet(app, id);
    if (!f) return;
    app.pickSea(`Куда направить: ${f.name}`, (z) => {
      const okk = setFleetMission(app.G, f, f.mis === 'port' ? 'patrol' : f.mis, z);
      app.toast(okk ? `${f.name} → ${SEA[z].name}` : 'Нет морского пути', okk ? 'good' : 'bad');
    });
  },
  fleetsplit: (app, id) => {
    const f = findFleet(app, id);
    if (!f) return;
    const part = {};
    for (const k of SHIP_KEYS) part[k] = Math.floor((f.ships[k] || 0) / 2);
    const nf = splitFleet(app.G, f, part);
    app.toast(nf ? `Создан ${nf.name}` : 'Слишком мало кораблей', nf ? 'good' : 'bad');
  },
  fleetmerge: (app, id) => {
    const f = findFleet(app, id);
    if (!f) return;
    for (const x of app.G.fleets.filter((y) => y !== f && y.o === f.o && y.zone === -1 && y.port === f.port)) mergeFleets(app.G, f, x);
    f.reserve = 0;
    app.toast('Флоты объединены', 'good');
  },
  fleetshow: (app, id) => { const f = findFleet(app, id); if (f && f.zone >= 0) { app.view.cam.x = SEA[f.zone].c[0]; app.view.cam.y = SEA[f.zone].c[1]; app.view.clampCam(); app.view.sel.fleet = f; app.view.mode = 'nav'; app.tools(); } },
});
export { neighbours, sameSide, dominance, PLANE, TIER_ROMAN, actStop, actSetManual };
