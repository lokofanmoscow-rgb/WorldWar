// Panels: diplomacy, trade, journal, statistics, system.
import { PANELS, A, HELP } from './app.js';
import { esc, ic, flag, bar, btn, sw } from './dom.js';
import { tabsHtml, eqName } from './panels1.js';
import { REG } from '../core/world.js';
import { COUNTRIES } from '../data/countries.js';
import { EQ, RES, RES_KEYS, LAND_EQ, AIR_EQ } from '../data/equip.js';
import { IDEO } from '../data/laws.js';
import { fmtDate, fmtNum, pct, pairKey } from '../core/util.js';
import { cn, atWar, enemies, opinion, hasNAP, sameSide, neighbours, justifyDays, justifyBlocker, warBlocker, strength, isAtWar } from '../core/diplo.js';
import { divsOf } from '../core/land.js';
import { shipsTotal } from '../core/navy.js';
import { COST, actImprove, actNAP, actGuarantee, actAccess, actInvite, actJoin, actLeave, actJustify, actDeclare, actPeace, actLendLease, peaceChance } from '../core/actions.js';
import { Storage } from './storage.js';

function relTag(G, me, t) {
  if (atWar(G, me, t)) return '<span class="tag red">война</span>';
  if (sameSide(G, me, t)) return '<span class="tag green">союзник</span>';
  const op = opinion(G, t, me);
  return `<span class="tag ${op >= 30 ? 'green' : op <= -30 ? 'red' : ''}">${op > 0 ? '+' : ''}${Math.round(op)}</span>`;
}
function countryRow(G, me, t) {
  const c = G.ctr[t];
  return `<button class="li" style="width:100%;text-align:left" data-a="diplo|${t}">${flag(t)}<div class="grow"><span class="nm">${esc(cn(G, t))}</span><small>${IDEO[c.ideo].name}${c.fac && G.factions[c.fac] ? ' · ' + esc(G.factions[c.fac].name) : ''}${c.capit ? ' · капитулировала' : ''}</small></div>${relTag(G, me, t)}</button>`;
}
PANELS.diplo = {
  title: (app) => (app.diploTag && app.G.ctr[app.diploTag] ? `${flag(app.diploTag)} ${esc(cn(app.G, app.diploTag))}` : 'Дипломатия'),
  render(app, tab = 'world') {
    const G = app.G, c = app.me(), me = c.tag;
    const t = app.diploTag;
    if (t && G.ctr[t] && t !== me) return this.country(app, t);
    let h = tabsHtml('diplo', { world: 'Мир', near: 'Соседи', majors: 'Державы', all: 'Все страны' }, tab);
    if (tab === 'world') {
      h += `<h4>${ic('tension')} Мировая напряжённость</h4><div style="font-size:20px;font-weight:700">${Math.round(G.tension)}%</div>${bar(G.tension / 100, 'r')}<p class="muted">Растёт от войн и захватов. Демократии не могут мобилизоваться и оправдывать войны, пока напряжённость низка.</p>`;
      h += '<h4>Альянсы</h4>';
      for (const id in G.factions) {
        const f = G.factions[id];
        const mem = f.members.filter((m) => G.ctr[m].alive);
        if (!mem.length) continue;
        const mine = c.fac === id;
        h += `<div class="cardx ${mine ? 'act' : ''}"><div class="ttl">${esc(f.name)}<small>лидер: ${esc(cn(G, f.leader))}</small></div><div class="desc">${mem.map((m) => `${flag(m)} ${esc(cn(G, m))}`).join(', ')}</div>
          ${mine ? (f.leader !== me ? `<div style="margin-top:5px">${btn('Выйти из альянса', 'leavefac', 'sm ghost')}</div>` : '') : `<div style="margin-top:5px">${btn(`Вступить (${COST.join})`, `joinfac|${id}`, 'sm', c.pp < COST.join)}</div>`}</div>`;
      }
      h += '<h4>Войны</h4>';
      const seen = new Set();
      let any = false;
      for (const key in G.war) {
        const [a, b] = key.split('|');
        if (!G.ctr[a].alive || !G.ctr[b].alive) continue;
        const la = G.ctr[a].fac ? G.factions[G.ctr[a].fac].leader : a, lb = G.ctr[b].fac ? G.factions[G.ctr[b].fac].leader : b;
        const k2 = pairKey(la, lb);
        if (seen.has(k2)) continue;
        seen.add(k2); any = true;
        h += `<div class="li">${flag(la)} <b>${esc(G.ctr[la].fac ? G.factions[G.ctr[la].fac].name : cn(G, la))}</b> <span class="muted">против</span> ${flag(lb)} <b>${esc(G.ctr[lb].fac ? G.factions[G.ctr[lb].fac].name : cn(G, lb))}</b></div>`;
      }
      if (!any) h += '<div class="muted">В мире нет войн</div>';
      const jl = G.justify.filter((j) => j.a === me);
      const wg = Object.keys(G.wargoals).filter((k) => k.startsWith(me + '>') && G.wargoals[k] > G.day && G.ctr[k.split('>')[1]].alive);
      if (jl.length || wg.length) {
        h += '<h4>Наши цели войны</h4>';
        for (const j of jl) h += `<div class="li">${flag(j.b)} ${esc(cn(G, j.b))} — оправдание, осталось ${j.done - G.day} дн.</div>`;
        for (const k of wg) { const b = k.split('>')[1]; h += `<div class="li">${flag(b)} <div class="grow">${esc(cn(G, b))} — цель оправдана до ${fmtDate(G.wargoals[k])}</div>${btn('К стране', `diplo|${b}`, 'sm')}</div>`; }
      }
    } else {
      let list = Object.keys(G.ctr).filter((x) => x !== me && G.ctr[x].alive);
      if (tab === 'near') { const nb = neighbours(G, me); list = list.filter((x) => nb.has(x) || atWar(G, me, x)); }
      if (tab === 'majors') list = list.filter((x) => COUNTRIES[x].major);
      list.sort((a, b) => (atWar(G, me, b) - atWar(G, me, a)) || (strength(G, b) - strength(G, a)));
      h += `<div class="list">${list.map((x) => countryRow(G, me, x)).join('') || '<div class="empty">Нет стран</div>'}</div>`;
    }
    return h;
  },
  country(app, t) {
    const G = app.G, c = app.me(), me = c.tag, o = G.ctr[t];
    const war = atWar(G, me, t);
    const sh = shipsTotal(G, t);
    const planes = G.wings.filter((w) => w.o === t).reduce((a, w) => a + w.n, 0);
    let h = `<div class="row" style="margin-bottom:6px">${btn('← К списку', 'diploback', 'sm ghost')}${btn('Показать на карте', `goto|${o.cap >= 0 ? o.cap : 0}`, 'sm ghost')}</div>`;
    h += `<div class="kv"><span>Глава государства</span><span>${esc(o.lead || '—')}</span><span>Режим</span><span>${IDEO[o.ideo].name}</span><span>Альянс</span><span>${o.fac && G.factions[o.fac] ? esc(G.factions[o.fac].name) : 'нет'}</span>
      ${o.over ? `<span>Сюзерен</span><span>${esc(cn(G, o.over))}</span>` : ''}<span>Отношение к нам</span><span>${Math.round(opinion(G, t, me))}</span>
      <span>Дивизии</span><span>${divsOf(G, t).length}</span><span>Заводы (гражд. / воен. / верфи)</span><span>${o._civ} / ${o._mil} / ${o._dock}</span><span>Корабли / самолёты</span><span>${sh.dd + sh.cl + sh.bb + sh.cv + sh.ss} / ${Math.round(planes)}</span></div>`;
    const tr = [];
    if (hasNAP(G, me, t)) tr.push('<span class="tag blue">пакт о ненападении</span>');
    if (G.pacts.guar[me + '>' + t]) tr.push('<span class="tag green">мы гарантируем</span>');
    if (G.pacts.guar[t + '>' + me]) tr.push('<span class="tag green">гарантирует нас</span>');
    if (G.pacts.access[me + '>' + t]) tr.push('<span class="tag">право прохода</span>');
    if ((G.truce[pairKey(me, t)] || 0) > G.day) tr.push(`<span class="tag gold">перемирие до ${fmtDate(G.truce[pairKey(me, t)])}</span>`);
    if (war) tr.push('<span class="tag red">война</span>');
    if (sameSide(G, me, t)) tr.push('<span class="tag green">союзник</span>');
    if (o.capit) tr.push('<span class="tag red">капитулировала</span>');
    if (tr.length) h += `<div style="margin:6px 0">${tr.join(' ')}</div>`;
    const en = enemies(G, t).filter((e) => G.ctr[e].alive);
    if (en.length) h += `<p class="muted">Воюет с: ${en.map((e) => `${flag(e)} ${esc(cn(G, e))}`).join(', ')}</p>`;
    h += `<h4>Действия <small>политвласть: ${Math.floor(c.pp)}</small></h4><div class="grid2">`;
    const b = (label, act, cost, cls = '', dis = false) => `<button class="btn sm ${cls} ${dis || c.pp < cost ? 'dis' : ''}" data-a="${act}|${t}">${label}${cost ? ` (${cost})` : ''}</button>`;
    if (!war) {
      h += b('Улучшить отношения', 'dimprove', COST.improve);
      h += b('Пакт о ненападении', 'dnap', COST.nap, '', hasNAP(G, me, t));
      h += b('Гарантировать', 'dguar', COST.guarantee, '', !!G.pacts.guar[me + '>' + t]);
      h += b('Право прохода', 'daccess', COST.access, '', !!G.pacts.access[me + '>' + t] || sameSide(G, me, t));
      if (!sameSide(G, me, t)) h += b('Пригласить в альянс', 'dinvite', COST.invite);
      h += b('Отправить снаряжение', 'dlease', 0, 'ghost');
    }
    h += '</div>';
    if (!war && !sameSide(G, me, t)) {
      const wgOk = (G.wargoals[me + '>' + t] || 0) > G.day;
      const j = G.justify.find((x) => x.a === me && x.b === t);
      h += `<h4>${ic('ws')} Война</h4>`;
      if (j) h += `<div class="cardx act">Оправдание войны: осталось ${j.done - G.day} дн.</div>`;
      else if (!wgOk) { const err = justifyBlocker(G, me, t); h += `<div class="row">${b(`Оправдать войну (${justifyDays(G, me, t)} дн.)`, 'djustify', COST.justify, '', !!err)}</div>${err ? `<p class="muted">${esc(err)}</p>` : ''}`; }
      const werr = warBlocker(G, me, t, false);
      h += `<div class="row" style="margin-top:6px">${btn('Объявить войну', `ddeclare|${t}`, 'red', !!werr)}</div>${werr ? `<p class="muted">${esc(werr)}</p>` : '<p class="muted">На стороне жертвы выступят её союзники и гаранты.</p>'}`;
    }
    if (war) {
      const ch = peaceChance(G, me, t);
      h += `<h4>Мир</h4><div class="row">${b('Предложить мир без аннексий', 'dpeace', COST.peace)}</div><p class="muted">Готовность противника к миру: ${pct(ch)} (нужно 50%). Оккупированные земли возвращаются владельцам.</p>`;
    }
    return h;
  },
};
Object.assign(A, {
  diplo: (app, t) => { app.diploTag = t; if (app.panel !== 'diplo') app.open('diplo'); },
  diploback: (app) => { app.diploTag = null; },
  dimprove: (app, t) => app.say(actImprove(app.G, app.me().tag, t)),
  dnap: (app, t) => app.say(actNAP(app.G, app.me().tag, t)),
  dguar: (app, t) => app.say(actGuarantee(app.G, app.me().tag, t)),
  daccess: (app, t) => app.say(actAccess(app.G, app.me().tag, t)),
  dinvite: (app, t) => app.say(actInvite(app.G, app.me().tag, t)),
  djustify: (app, t) => app.say(actJustify(app.G, app.me().tag, t)),
  dpeace: (app, t) => app.say(actPeace(app.G, app.me().tag, t)),
  joinfac: (app, id) => app.say(actJoin(app.G, app.me().tag, id)),
  leavefac: (app) => app.say(actLeave(app.G, app.me().tag)),
  ddeclare: (app, t) => {
    const G = app.G;
    app.modal({ title: 'Объявить войну?', text: `Мы объявляем войну: ${cn(G, t)}. Мировая напряжённость вырастет, а союзники и гаранты противника вступят в войну.`,
      opts: [{ text: 'Объявить войну', cls: 'red', fn: () => { app.say(actDeclare(G, app.me().tag, t)); app.afterAction(); } }, { text: 'Отмена' }] });
  },
  dlease: (app, t) => {
    const G = app.G, c = app.me();
    const opts = [];
    for (const k of [...LAND_EQ, ...AIR_EQ]) {
      const n = Math.floor(c.stock[k] || 0);
      if (n < 10) continue;
      const amt = Math.max(10, Math.floor(n / 2));
      opts.push({ text: `${eqName(c, k)}: ${fmtNum(amt)}`, sub: `на складе ${fmtNum(n)} · стоимость ${COST.lease} политвласти`, cls: 'ghost', fn: () => { app.say(actLendLease(G, c.tag, t, k, amt)); app.afterAction(); } });
    }
    opts.push({ text: 'Отмена' });
    app.modal({ title: `Помощь: ${cn(G, t)}`, text: opts.length > 1 ? 'Выберите, что отправить (половину запаса со склада):' : 'На складе нет лишнего снаряжения.', opts });
  },
});

// ---- more ------------------------------------------------------------------------------------------
PANELS.more = {
  title: 'Ещё',
  render(app, tab = 'sys') {
    const G = app.G, c = app.me();
    let h = tabsHtml('more', { sys: 'Игра', trade: 'Торговля', log: 'Журнал', stats: 'Мир в цифрах', help: 'Справка' }, tab);
    if (tab === 'sys') {
      h += `<div class="grid2">${btn(`${ic('save')} Сохранить`, 'quicksave', '')}${btn(`${ic('menu')} Главное меню`, 'menu', 'ghost')}</div>`;
      h += `<h4>Ячейки сохранения</h4><div class="grid2">${[1, 2, 3, 4].map((n) => btn(`Сохранить в ${n}`, `saveslot2|${n}`, 'sm ghost')).join('')}</div>`;
      h += `<h4>Настройки</h4><div class="list"><div class="li"><div class="grow"><span class="nm">Автосохранение</span><small>Раз в месяц и при сворачивании</small></div>${sw(G.opts.autosave !== false, 'optauto')}</div></div>`;
      h += `<p class="muted">Сложность: ${{ easy: 'лёгкая', normal: 'обычная', hard: 'тяжёлая' }[G.diff] || G.diff} · ${fmtDate(G.day)} · ${Storage.native ? 'сохранения в памяти устройства' : 'сохранения в браузере'}</p>`;
    } else if (tab === 'trade') {
      if (!c) return h + '<div class="empty">Недоступно</div>';
      h += `<div class="li" style="border:0"><div class="grow"><span class="nm">Автоматическая торговля</span><small>Недостающие ресурсы покупаются за гражданские заводы (8 ед. за завод)</small></div>${sw(c.autoTrade, 'autotrade')}</div>`;
      h += `<table class="t"><tr><th></th><th class="n">Добыча</th><th class="n">На экспорт</th><th class="n">Импорт</th><th class="n">Расход</th><th class="n">Баланс</th></tr>`;
      for (const k of RES_KEYS) h += `<tr><td>${ic(k)} ${RES[k].name}</td><td class="n">${Math.round(c._res[k])}</td><td class="n">${Math.round(c._res[k] * c._export)}</td><td class="n">${Math.round(c.trade.imp[k] || 0)}</td><td class="n">${Math.round(c._need ? c._need[k] : 0)}</td><td class="n ${c._bal && c._bal[k] < -0.5 ? 'neg' : 'pos'}">${c._bal ? Math.round(c._bal[k]) : 0}</td></tr>`;
      h += `</table><div class="kv" style="margin-top:8px"><span>Заводов занято импортом</span><span>${c.trade.cost.toFixed(1)}</span><span>Заводов получено за экспорт</span><span>${c.trade.gain.toFixed(1)}</span><span>Работа морских конвоев</span><span>${pct(c._convoyEff ?? 1)}</span></div>`;
      const from = Object.keys(c.trade.from || {});
      if (from.length) h += `<h4>Поставщики</h4><div class="list">${from.map((t) => `<div class="li">${flag(t)}<div class="grow">${esc(cn(G, t))}</div><b>${Math.round(c.trade.from[t])}</b></div>`).join('')}</div>`;
      h += '<p class="muted">Нехватка ресурса снижает выпуск линий, которым он нужен. Доля экспорта задаётся законом о торговле. Морской импорт требует транспортов и страдает от вражеских рейдеров.</p>';
    } else if (tab === 'log') {
      const list = G.news.slice().reverse();
      h += '<div class="list">';
      for (const n of list.slice(0, 80)) h += `<div class="li" ${n.r >= 0 ? `data-a="goto|${n.r}"` : ''}><div class="grow"><small>${fmtDate(n.d)}</small>${esc(n.t)}</div></div>`;
      h += list.length ? '</div>' : '<div class="empty">Пока ничего не произошло</div></div>';
    } else if (tab === 'stats') {
      const list = Object.values(G.ctr).filter((x) => x.alive).sort((a, b) => strength(G, b.tag) - strength(G, a.tag)).slice(0, 24);
      h += `<table class="t"><tr><th>Страна</th><th class="n">Див.</th><th class="n">Заводы</th><th class="n">Флот</th><th class="n">Потери</th></tr>`;
      for (const x of list) {
        const sh = shipsTotal(G, x.tag);
        h += `<tr data-a="diplo|${x.tag}"><td>${flag(x.tag)} ${esc(cn(G, x.tag))}${isAtWar(G, x.tag) ? ' ⚔' : ''}</td><td class="n">${divsOf(G, x.tag).length}</td><td class="n">${x._civ}/${x._mil}</td><td class="n">${sh.dd + sh.cl + sh.bb + sh.cv + sh.ss}</td><td class="n">${fmtNum(x.stats.lost * 1000)}</td></tr>`;
      }
      h += '</table>';
    } else h += HELP;
    return h;
  },
};
Object.assign(A, {
  quicksave: (app) => app.saveTo('1'),
  saveslot2: (app, n) => app.saveTo(String(n)),
  optauto: (app) => { app.G.opts.autosave = app.G.opts.autosave === false; },
});
export { REG, EQ };
