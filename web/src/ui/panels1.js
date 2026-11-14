// Panels: country & politics, national focus, research, construction, production.
import { PANELS, A } from './app.js';
import { esc, ic, flag, bar, btn, stepper, sw } from './dom.js';
import { REG, NREG } from '../core/world.js';
import { COUNTRIES } from '../data/countries.js';
import { TECHS, TECH_LIST, TECH_CATS, MODS } from '../data/techs.js';
import { EQ, SHIP, RES, RES_KEYS, TIER_ROMAN, BAT, SUPC, LAND_EQ, AIR_EQ } from '../data/equip.js';
import { LAWS, ADVISORS, ADVISOR_COST, MAX_ADVISORS, IDEO, IDEO_KEYS, BUILD, BUILD_KEYS, LAW_COST } from '../data/laws.js';
import { BRANCH } from '../data/focuses.js';
import { fmtDate, fmtNum, pct, yearOf } from '../core/util.js';
import { cn, enemies, surrenderLimit, vpLost, isAtWar, frontFlags } from '../core/diplo.js';
import { mod } from '../core/mods.js';
import {
  availableCivs, freeMil, freeDock, maxManpower, lawBlocker, canResearch, researchSpeed, startResearch, buildBlocker, queueBuild, regionSlots, usedSlots,
  addLine, setLineFac, addDockLine, lineCap, MAX_FAC_PER_LINE, FACTORY_OUT, CIV_BUILD, MAX_CIV_PER_PROJECT,
} from '../core/economy.js';
import { manpowerInField } from '../core/land.js';
import { focusTree, focusBlocker, startFocus, FOCUS_BY_ID } from '../core/focus.js';
import { actLaw, actAdvisor, actFireAdvisor } from '../core/actions.js';

export function fmtMods(mods) {
  const out = [];
  for (const k in mods) {
    const M = MODS[k], v = mods[k];
    if (!M || !v) continue;
    const good = (v > 0) === !!M[2];
    out.push(`<span class="${good ? 'pos' : 'neg'}">${M[0]}: ${v > 0 ? '+' : ''}${M[1] ? Math.round(v * 100) + '%' : v}</span>`);
  }
  return out.join(' · ');
}
export const tabsHtml = (panel, tabs, cur) => `<div class="tabs">${Object.keys(tabs).map((k) => `<button class="${k === cur ? 'on' : ''}" data-a="tab|${panel}|${k}">${tabs[k]}</button>`).join('')}</div>`;
export const eqName = (c, k) => `${EQ[k].name}${c.eqTier[k] ? ' ' + TIER_ROMAN[c.eqTier[k]] : ''}`;

// ---- country ---------------------------------------------------------------------------------------
PANELS.country = {
  title: (app) => `${flag(app.me().tag)} ${esc(cn(app.G, app.me().tag))}`,
  render(app, tab = 'main') {
    const G = app.G, c = app.me();
    let h = tabsHtml('country', { main: 'Обзор', laws: 'Законы', adv: 'Советники', auto: 'Министры' }, tab);
    if (tab === 'main') {
      const fac = c.fac && G.factions[c.fac];
      const inField = manpowerInField(G, c);
      h += `<div class="kv"><span>Глава государства</span><span>${esc(c.lead || '—')}</span><span>Режим</span><span>${IDEO[c.ideo].name}</span>
        <span>Альянс</span><span>${fac ? esc(fac.name) : 'нет'}</span>${c.over ? `<span>Сюзерен</span><span>${flag(c.over)} ${esc(cn(G, c.over))}</span>` : ''}
        <span>Население</span><span>${fmtNum(c._pop * 1000)}</span></div>`;
      h += `<h4>${ic('pp')} Политическая власть <small>+${(2 * (1 + mod(c, 'ppGain'))).toFixed(1)} в день</small></h4><div style="font-size:20px;font-weight:700">${Math.floor(c.pp)}</div>`;
      h += `<div class="grid2" style="margin-top:8px"><div>${ic('stab')} Стабильность ${pct(c.stab)}${bar(c.stab, c.stab < 0.35 ? 'r' : 'g')}</div><div>${ic('ws')} Поддержка войны ${pct(c.ws)}${bar(c.ws, 'y')}</div></div>`;
      h += `<p class="muted">Стабильность влияет на выпуск заводов и политвласть, поддержка войны — на боевой дух и предел капитуляции.</p>`;
      h += `<h4>${ic('mp')} Людские ресурсы</h4><div class="kv"><span>Свободные призывники</span><span>${fmtNum(c.mp * 1000)}</span><span>В армии и обучении</span><span>${fmtNum(inField * 1000)}</span><span>Потери (безвозвратные)</span><span>${fmtNum(c.stats.lost * 1000)}</span><span>Всего годных (${LAWS.con.list[c.laws.con].name.toLowerCase()})</span><span>${fmtNum(maxManpower(c) * 1000)}</span></div>`;
      if (isAtWar(G, c.tag)) {
        const v = vpLost(G, c.tag).ratio, lim = surrenderLimit(G, c);
        h += `<h4>${ic('skull')} Угроза капитуляции</h4><div>Потеряно ключевых территорий: ${pct(v)} из допустимых ${pct(lim)}${bar(v / lim, 'r')}</div>`;
        h += `<p class="muted">Воюем с: ${enemies(G, c.tag).filter((e) => G.ctr[e].alive).map((e) => `${flag(e)} ${esc(cn(G, e))}`).join(', ')}</p>`;
      }
      h += `<h4>Поддержка идеологий</h4>`;
      for (const k of IDEO_KEYS) h += `<div class="row" style="margin:3px 0"><span style="width:118px">${IDEO[k].name}</span><div class="grow"><div class="bar"><i style="width:${(c.sup[k] * 100).toFixed(0)}%;background:${IDEO[k].col}"></i></div></div><b style="width:40px;text-align:right">${pct(c.sup[k])}</b></div>`;
      h += `<h4>Национальные особенности</h4>`;
      if (!c.spirits.length) h += '<div class="muted">Нет</div>';
      for (const s of c.spirits) h += `<div class="cardx"><div class="ttl">${esc(s.name)}${s.until ? `<small>до ${fmtDate(s.until)}</small>` : ''}</div><div class="desc">${esc(s.desc || '')}</div><div class="desc">${fmtMods(s.mods)}</div></div>`;
    } else if (tab === 'laws') {
      h += `<p class="muted">Смена закона стоит ${LAW_COST} политвласти. У вас: <b>${Math.floor(c.pp)}</b></p>`;
      for (const kind of ['eco', 'con', 'trd']) {
        h += `<h4>${LAWS[kind].name}</h4>`;
        LAWS[kind].list.forEach((L, i) => {
          const cur = c.laws[kind] === i;
          const err = cur ? null : lawBlocker(G, c, kind, i);
          h += `<div class="cardx ${cur ? 'act' : ''}"><div class="ttl">${esc(L.name)}${cur ? '<span class="tag blue">действует</span>' : ''}</div><div class="desc">${esc(L.desc)} ${fmtMods(L.mods)}</div>${cur ? '' : `<div class="row" style="margin-top:5px">${btn('Принять', `law|${kind}|${i}`, 'sm', !!err)}${err ? `<span class="muted">${esc(err)}</span>` : ''}</div>`}</div>`;
        });
      }
    } else if (tab === 'adv') {
      h += `<p class="muted">Советник стоит ${ADVISOR_COST} политвласти, одновременно не более ${MAX_ADVISORS}. У вас: <b>${Math.floor(c.pp)}</b></p><h4>Назначены <small>${c.adv.length}/${MAX_ADVISORS}</small></h4>`;
      if (!c.adv.length) h += '<div class="muted">Никто не назначен</div>';
      for (const a of c.adv) h += `<div class="cardx act"><div class="ttl">${esc(ADVISORS[a].name)}</div><div class="desc">${esc(ADVISORS[a].desc)}</div><div style="margin-top:5px">${btn('Уволить', `fire|${a}`, 'sm ghost')}</div></div>`;
      h += '<h4>Кандидаты</h4>';
      for (const a in ADVISORS) {
        if (c.adv.includes(a)) continue;
        h += `<div class="cardx"><div class="ttl">${esc(ADVISORS[a].name)}</div><div class="desc">${esc(ADVISORS[a].desc)}</div><div style="margin-top:5px">${btn(`Назначить (${ADVISOR_COST})`, `hire|${a}`, 'sm', c.pp < ADVISOR_COST || c.adv.length >= MAX_ADVISORS)}</div></div>`;
      }
    } else if (tab === 'auto') {
      const au = c.auto || (c.auto = {});
      const row = (k, name, desc, on, act) => `<div class="li"><div class="grow"><span class="nm">${name}</span><small>${desc}</small></div>${sw(on, act || `auto|${k}`)}</div>`;
      h += `<p class="muted">Поручите рутину министрам — они действуют так же, как правительства других стран.</p><div class="list">`;
      h += row('research', 'Наука', 'Министр сам выбирает исследования', au.research);
      h += row('build', 'Строительство', 'Очередь строительства ведётся автоматически', au.build);
      h += row('prod', 'Производство', 'Распределение заводов и верфей по линиям', au.prod);
      h += row('recruit', 'Набор войск', 'Обучение новых дивизий и обновление шаблонов', au.recruit);
      h += row('staff', 'Генштаб', 'Развёртывание и атаки по вашим установкам на фронтах', c.staff.auto, 'staffauto');
      h += row('air', 'Авиация', 'Формирование авиакрыльев и перебазирование к фронту', au.air);
      h += row('navy', 'Флот', 'Задачи флотов: патруль, рейды, охрана конвоев', au.navy);
      h += row('trade', 'Торговля', 'Закупка недостающих ресурсов за гражданские заводы', c.autoTrade, 'autotrade');
      h += '</div>';
    }
    return h;
  },
};
Object.assign(A, {
  law: (app, kind, i) => app.say(actLaw(app.G, app.me().tag, kind, Number(i))),
  hire: (app, id) => app.say(actAdvisor(app.G, app.me().tag, id)),
  fire: (app, id) => app.say(actFireAdvisor(app.G, app.me().tag, id)),
  auto: (app, k) => { const c = app.me(); c.auto = c.auto || {}; c.auto[k] = !c.auto[k]; },
  staffauto: (app) => { const c = app.me(); c.staff.auto = !c.staff.auto; },
  autotrade: (app) => { const c = app.me(); c.autoTrade = !c.autoTrade; },
});

// ---- focus -----------------------------------------------------------------------------------------
PANELS.focus = {
  title: 'Национальные цели',
  render(app) {
    const G = app.G, c = app.me();
    const tree = focusTree(c.tag);
    let h = '';
    const cur = c.focus.cur && FOCUS_BY_ID[c.focus.cur];
    if (cur) h += `<div class="cardx act"><div class="ttl">${ic('focus')} ${esc(cur.name)}<small>осталось ${cur.days - c.focus.p} дн.</small></div><div class="desc">${esc(cur.desc)}</div>${bar(c.focus.p / cur.days)}</div>`;
    else h += `<div class="cardx lock"><div class="ttl">${ic('warn')} Цель не выбрана</div><div class="desc">Выберите одну из доступных целей ниже. Единовременно выполняется одна цель.</div></div>`;
    const groups = {};
    for (const f of tree) (groups[f.br] || (groups[f.br] = [])).push(f);
    for (const br in groups) {
      h += `<h4>${BRANCH[br] || br}</h4>`;
      for (const f of groups[br]) {
        const done = c.focus.done[f.id], isCur = c.focus.cur === f.id;
        const err = done || isCur ? null : focusBlocker(G, c, f);
        const cls = done ? 'done' : isCur ? 'act' : err ? 'lock' : '';
        h += `<div class="cardx ${cls}"><div class="ttl">${done ? ic('check') : err ? ic('lock') : ''}${esc(f.name)}<small>${f.days} дн.</small></div><div class="desc">${esc(f.desc)}</div>`;
        if (!done && !isCur) h += err ? `<div class="desc neg">${esc(err)}</div>` : `<div style="margin-top:5px">${btn(c.focus.cur ? 'Заменить текущую цель' : 'Начать', `focus|${f.id}`, 'sm ' + (c.focus.cur ? 'ghost' : 'red'))}</div>`;
        h += '</div>';
      }
    }
    return h;
  },
};
A.focus = (app, id) => { const c = app.me(); if (startFocus(app.G, c, id)) app.toast('Цель принята: ' + FOCUS_BY_ID[id].name, 'good'); };

// ---- research --------------------------------------------------------------------------------------
function techEffects(t) {
  const out = [];
  if (t.eq) out.push(`Новая модель: ${EQ[t.eq[0]].name} ${TIER_ROMAN[t.eq[1]]}`);
  if (t.ship) out.push(`Новый проект: ${SHIP[t.ship[0]].name} ${TIER_ROMAN[t.ship[1]]}`);
  if (t.unlockBat) out.push(`Открывает: ${BAT[t.unlockBat].name}`);
  if (t.unlockSup) out.push(`Открывает роту: ${SUPC[t.unlockSup].name}`);
  if (t.unlock && BUILD[t.unlock]) out.push(`Открывает постройку: ${BUILD[t.unlock].name}`);
  let s = out.join('. ');
  if (t.mod) s += (s ? '. ' : '') + fmtMods(t.mod);
  return s;
}
PANELS.research = {
  title: 'Исследования',
  render(app, tab = 'ind') {
    const G = app.G, c = app.me();
    let h = `<h4>Ячейки исследований <small>скорость ${pct(1 + mod(c, 'researchSpeed'))}</small></h4>`;
    for (let s = 0; s < c.rs; s++) {
      const r = c.research[s];
      if (!r) { h += `<div class="cardx lock"><div class="ttl">${ic('research')} Ячейка ${s + 1} свободна</div><div class="desc">Выберите технологию ниже.</div></div>`; continue; }
      const t = TECHS[r.id], sp = researchSpeed(G, c, r.id);
      h += `<div class="cardx act"><div class="ttl">${esc(t.name)}<small>${Math.ceil((t.cost - r.p) / sp)} дн.</small></div>${bar(r.p / t.cost)}<div style="margin-top:5px">${btn('Отменить', `rcancel|${s}`, 'sm ghost')}</div></div>`;
    }
    if (c.rbonus.length) h += `<p class="muted">Бонусы: ${c.rbonus.map((b) => `${TECH_CATS[b.cat] || 'любая'} +${Math.round(b.pct * 100)}% (×${b.n})`).join(', ')}</p>`;
    h += tabsHtml('research', TECH_CATS, tab);
    const year = yearOf(G.day);
    const list = TECH_LIST.filter((t) => t.cat === tab).sort((a, b) => a.year - b.year);
    const free = c.research.filter(Boolean).length < c.rs;
    for (const t of list) {
      const done = c.tech[t.id];
      const cur = c.research.find((r) => r && r.id === t.id);
      const can = !done && !cur && canResearch(c, t.id);
      const ahead = t.year - year;
      h += `<div class="cardx ${done ? 'done' : cur ? 'act' : can ? '' : 'lock'}"><div class="ttl">${done ? ic('check') : !can && !cur ? ic('lock') : ''}${esc(t.name)}<small>${t.year} г.</small></div><div class="desc">${t.desc ? esc(t.desc) + ' ' : ''}${techEffects(t)}</div>`;
      if (cur) h += bar(cur.p / t.cost);
      else if (can) {
        const days = Math.ceil(t.cost / researchSpeed(G, c, t.id));
        h += `<div class="row" style="margin-top:5px">${btn('Исследовать', `research|${t.id}`, 'sm red', !free)}<span class="muted">${days} дн.${ahead > 0.1 ? ` · <span class="neg">опережает время</span>` : ''}</span></div>`;
      } else if (!done) {
        const need = t.req.filter((q) => !c.tech[q]).map((q) => TECHS[q].name);
        h += `<div class="desc neg">${need.length ? 'Требуется: ' + esc(need.join(', ')) : 'Недоступно: выбрана другая доктрина'}</div>`;
      }
      h += '</div>';
    }
    return h;
  },
};
Object.assign(A, {
  research: (app, id) => { if (!startResearch(app.G, app.me(), id)) app.toast('Нет свободной ячейки исследований', 'bad'); },
  rcancel: (app, s) => { app.me().research[Number(s)] = null; },
});

// ---- construction ----------------------------------------------------------------------------------
function buildCandidates(G, c, t) {
  const front = frontFlags(G);
  const out = [];
  for (let i = 0; i < NREG; i++) {
    const r = G.reg[i];
    if (r.o !== c.tag || r.c !== c.tag || buildBlocker(G, c, t, i)) continue;
    let s = r.infra * 2 + (r.core === c.tag ? 6 : 0) - (front[i] ? 6 : 0) + r.pop / 4000;
    if (t === 'infra') s = (r.civ + r.mil) * 3 - r.infra * 2;
    if (t === 'air' || t === 'fort') s = (front[i] ? 8 : 0) + r.vp * 0.4 - r[t] * 2;
    if (t === 'aa') s = (r.civ + r.mil) * 2 - r.aa * 3;
    if (t === 'port') s = r.vp - r.port * 3;
    out.push([s, i]);
  }
  return out.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}
PANELS.build = {
  title: 'Строительство',
  render(app) {
    const G = app.G, c = app.me();
    const total = Math.floor(c._civ * (1 - c._consumer));
    const avail = availableCivs(c);
    let h = `<div class="kv"><span>${ic('civ')} Гражданские заводы</span><span>${c._civ}</span><span>Товары потребления (${pct(c._consumer)})</span><span>−${c._civ - total}</span><span>Торговля (импорт / экспорт)</span><span>−${Math.ceil(c.trade.cost)} / +${Math.floor(c.trade.gain)}</span><span>Доступно для стройки</span><span>${avail}</span></div>`;
    h += `<p class="muted">На один объект работает до ${MAX_CIV_PER_PROJECT} заводов; объекты строятся по очереди сверху вниз.</p>`;
    h += `<h4>Очередь <small>${c.build.length} объектов</small></h4>`;
    if (!c.build.length) h += `<div class="empty">Очередь пуста${avail > 0 ? ' — заводы простаивают!' : ''}</div>`;
    let left = avail;
    c.build.forEach((b, k) => {
      const B = BUILD[b.t];
      const use = Math.min(left, MAX_CIV_PER_PROJECT);
      left -= use;
      const rate = use * CIV_BUILD * (1 + mod(c, 'buildSpeed') + (B.mod ? mod(c, B.mod) : 0)) * (0.5 + 0.1 * G.reg[b.r].infra);
      const days = rate > 0 ? Math.ceil((B.cost - b.p) / rate) : null;
      h += `<div class="cardx ${use ? 'act' : ''}"><div class="ttl">${esc(B.name)}<small>${days ? days + ' дн.' : 'ждёт'}</small></div><div class="desc">${esc(REG[b.r].name)} · заводов: ${use}</div>${bar(b.p / B.cost)}<div class="row" style="margin-top:5px">${k > 0 ? btn('▲ Вверх', `bup|${k}`, 'sm ghost') : ''}${btn('Показать', `goto|${b.r}`, 'sm ghost')}${btn('Отменить', `bdel|${k}`, 'sm ghost')}</div></div>`;
    });
    h += `<h4>Новый объект</h4><div class="grid2">`;
    const sel = app.buildType;
    for (const t of BUILD_KEYS) {
      const B = BUILD[t];
      const locked = B.unlock && !c.unlocked[B.unlock];
      h += `<button class="btn ${sel === t ? 'red' : 'ghost'} ${locked ? 'dis' : ''}" data-a="btype|${t}">${esc(B.short)}</button>`;
    }
    h += '</div>';
    if (sel) {
      const B = BUILD[sel];
      const cands = buildCandidates(G, c, sel);
      h += `<h4>${esc(B.name)} — где строить <small>${B.cost} очков</small></h4><div class="row" style="margin-bottom:4px">${btn(`${ic('target')} Выбрать на карте`, `bmap|${sel}`, 'sm blue')}${cands.length ? btn('+ Лучший регион', `badd|${sel}|${cands[0]}`, 'sm') : ''}</div><div class="list">`;
      if (!cands.length) h += '<div class="empty">Нет подходящих регионов (нет мест под застройку?)</div>';
      for (const i of cands.slice(0, 10)) {
        const r = G.reg[i];
        h += `<div class="li"><div class="grow"><span class="nm">${esc(REG[i].name)}</span><small>${B.slot ? `мест ${usedSlots(r)}/${regionSlots(c, r)} · ` : `уровень ${r[sel]}/${B.max} · `}инфр. ${r.infra} · Г${r.civ} В${r.mil}</small></div>${btn('+', `badd|${sel}|${i}`, 'sm')}</div>`;
      }
      h += '</div>';
    }
    return h;
  },
};
Object.assign(A, {
  btype: (app, t) => { app.buildType = app.buildType === t ? null : t; },
  badd: (app, t, i) => { const err = queueBuild(app.G, app.me(), t, Number(i)); if (err) app.toast(err, 'bad'); else app.toast(`В очереди: ${BUILD[t].name} — ${REG[Number(i)].name}`, 'good'); },
  bdel: (app, k) => { app.me().build.splice(Number(k), 1); },
  bup: (app, k) => { const q = app.me().build; k = Number(k); if (k > 0) [q[k - 1], q[k]] = [q[k], q[k - 1]]; },
  bmap: (app, t) => {
    const G = app.G, c = app.me();
    app.pickRegion(`Где строить: ${BUILD[t].name}`, (i) => G.reg[i].o === c.tag && G.reg[i].c === c.tag && !buildBlocker(G, c, t, i), (i) => A.badd(app, t, i));
  },
  buildhere: (app, r) => { app.buildHere = Number(r); app.open('build'); app.buildType = app.buildType || 'mil'; app.toast('Выберите тип объекта и нажмите «Выбрать на карте» или «+»', 'info'); },
  goto: (app, r) => { app.view.centerOn(Number(r), Math.max(app.view.cam.s, 0.09)); app.view.sel.region = Number(r); },
});

// ---- production ------------------------------------------------------------------------------------
PANELS.prod = {
  title: 'Производство',
  render(app, tab = 'mil') {
    const G = app.G, c = app.me();
    let h = tabsHtml('prod', { mil: 'Военные заводы', dock: 'Верфи', stock: 'Склад' }, tab);
    if (tab === 'mil') {
      const free = freeMil(c);
      h += `<div class="row"><div class="grow">${ic('mil')} Заводов: <b>${c._mil}</b> · свободно: <b class="${free > 0 ? 'neg' : ''}">${free}</b></div><span class="muted">предел эфф. ${pct(lineCap(c))}</span></div>`;
      if (!c.lines.length) h += '<div class="empty">Нет производственных линий</div>';
      c.lines.forEach((l, k) => {
        const E = EQ[l.eq];
        const short = Object.keys(E.res).filter((r) => c._short && c._short[r] > 0.05);
        const need = c.need[l.eq] || 0, have = (c.fielded[l.eq] || 0);
        const est = l._out ?? (l.fac * FACTORY_OUT * l.eff * Math.max(0.2, 1 + mod(c, 'factoryOutput'))) / E.cost;
        h += `<div class="cardx"><div class="ttl">${esc(eqName(c, l.eq))}<small>${est >= 10 ? Math.round(est) : est.toFixed(1)} в день</small></div>
          <div class="row" style="margin-top:5px">${stepper(l.fac, `lfac|${k}|-1`, `lfac|${k}|1`, l.fac <= 0, free <= 0 || l.fac >= MAX_FAC_PER_LINE)}${btn('+5', `lfac|${k}|5`, 'sm ghost', free <= 0)}${btn('−5', `lfac|${k}|-5`, 'sm ghost', l.fac <= 0)}<div class="grow"></div>${btn(ic('close'), `ldel|${k}`, 'sm ghost')}</div>
          <div class="desc">Эффективность ${pct(l.eff)}${bar(l.eff / lineCap(c), 'g')}</div>
          <div class="desc">Склад: ${fmtNum(c.stock[l.eq] || 0)}${E.kind === 'land' ? ` · в войсках ${fmtNum(have)} из ${fmtNum(need)}` : ''}${short.length ? ` · <span class="neg">не хватает: ${short.map((r) => RES[r].name.toLowerCase()).join(', ')}</span>` : ''}</div></div>`;
      });
      h += '<h4>Новая линия</h4><div class="grid2">';
      for (const k in EQ) {
        if (c.lines.some((l) => l.eq === k)) continue;
        const okk = c.eqTier[k] >= 1;
        h += `<button class="btn ghost sm ${okk && free > 0 ? '' : 'dis'}" data-a="ladd|${k}">${esc(EQ[k].short)}${okk ? '' : ' ' + ic('lock')}</button>`;
      }
      h += `</div><p class="muted">Завод даёт ${FACTORY_OUT} ед. в день × эффективность. Эффективность растёт со временем и падает при расширении и смене модели. Линиям нужны ресурсы.</p>`;
    } else if (tab === 'dock') {
      const free = freeDock(c);
      h += `<div>${ic('dock')} Верфей: <b>${c._dock}</b> · свободно: <b class="${free > 0 ? 'neg' : ''}">${free}</b> · ${ic('ship')} транспортов: <b>${Math.floor(c.convoys)}</b>${c._convoyNeed ? ` (нужно ${Math.ceil(c._convoyNeed)})` : ''}</div>`;
      if (!c.docks.length) h += '<div class="empty">Корабли не строятся</div>';
      c.docks.forEach((l, k) => {
        const S = SHIP[l.ship];
        const days = l._out > 0 ? Math.ceil((S.cost - l.p) / l._out) : null;
        h += `<div class="cardx"><div class="ttl">${esc(S.name)}${l.ship !== 'convoy' && c.shipTier[l.ship] ? ' ' + TIER_ROMAN[c.shipTier[l.ship]] : ''}<small>${days ? days + ' дн.' : ''}</small></div>
          <div class="row" style="margin-top:5px">${stepper(l.fac, `dfac|${k}|-1`, `dfac|${k}|1`, l.fac <= 0, free <= 0 || l.fac >= S.maxDock)}<span class="muted">макс. ${S.maxDock}</span><div class="grow"></div>${btn(ic('close'), `ddel|${k}`, 'sm ghost')}</div>${bar(l.p / S.cost)}</div>`;
      });
      h += '<h4>Заложить</h4><div class="grid2">';
      for (const k in SHIP) {
        const okk = !SHIP[k].tech || c.shipTier[k] >= 1;
        h += `<button class="btn ghost sm ${okk && free > 0 ? '' : 'dis'}" data-a="dadd|${k}">${esc(SHIP[k].short)}${okk ? '' : ' ' + ic('lock')}</button>`;
      }
      h += '</div><p class="muted">Готовые корабли поступают в резерв флота (панель «Флот»). Транспорты нужны для торговли, снабжения за морем и десантов.</p>';
    } else {
      h += `<table class="t"><tr><th>Снаряжение</th><th class="n">Склад</th><th class="n">В войсках</th><th class="n">Нужно</th></tr>`;
      for (const k of LAND_EQ) {
        const need = c.need[k] || 0, f = c.fielded[k] || 0;
        if (!need && !(c.stock[k] > 0)) continue;
        const r = need ? f / need : 1;
        h += `<tr><td>${esc(eqName(c, k))}</td><td class="n">${fmtNum(Math.floor(c.stock[k] || 0))}</td><td class="n ${r < 0.8 ? 'neg' : ''}">${fmtNum(Math.floor(f))}</td><td class="n">${fmtNum(Math.round(need))}</td></tr>`;
      }
      h += '</table><h4>Авиация на складе</h4><table class="t">';
      for (const k of AIR_EQ) h += `<tr><td>${esc(eqName(c, k))}</td><td class="n">${Math.floor(c.stock[k] || 0)}</td></tr>`;
      h += '</table><p class="muted">Снаряжение со склада само поступает в дивизии. Самолёты сводятся в авиакрылья в панели «Авиация».</p>';
      h += `<h4>Ресурсы</h4><table class="t"><tr><th></th><th class="n">Добыча</th><th class="n">Импорт</th><th class="n">Расход</th><th class="n">Баланс</th></tr>`;
      for (const k of RES_KEYS) h += `<tr><td>${ic(k)} ${RES[k].name}</td><td class="n">${Math.round(c._res[k])}</td><td class="n">${Math.round(c.trade.imp[k] || 0)}</td><td class="n">${Math.round(c._need ? c._need[k] : 0)}</td><td class="n ${c._bal && c._bal[k] < -0.5 ? 'neg' : ''}">${c._bal ? Math.round(c._bal[k]) : 0}</td></tr>`;
      h += '</table>';
    }
    return h;
  },
};
Object.assign(A, {
  ladd: (app, k) => { const c = app.me(); const err = addLine(c, k, Math.min(5, freeMil(c))); if (err) app.toast(err, 'bad'); },
  lfac: (app, k, d) => { const c = app.me(); const l = c.lines[Number(k)]; if (l) setLineFac(c, l, l.fac + Number(d)); },
  ldel: (app, k) => { app.me().lines.splice(Number(k), 1); },
  dadd: (app, k) => { const c = app.me(); const err = addDockLine(c, k, Math.min(SHIP[k].maxDock, freeDock(c), 5)); if (err) app.toast(err, 'bad'); },
  dfac: (app, k, d) => { const c = app.me(); const l = c.docks[Number(k)]; if (!l) return; const n = Math.max(0, Math.min(SHIP[l.ship].maxDock, l.fac + Number(d), l.fac + freeDock(c))); l.fac = n; },
  ddel: (app, k) => { app.me().docks.splice(Number(k), 1); },
});
export { COUNTRIES, fmtDate };
