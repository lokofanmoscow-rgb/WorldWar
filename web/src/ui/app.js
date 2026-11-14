// Application shell: game loop, HUD, map interaction, pop-ups, main menu.
import { startGame, tick, serialize, deserialize, VERSION } from '../core/game.js';
import { REG, NREG, SEA, TERRAIN } from '../core/world.js';
import { COUNTRIES } from '../data/countries.js';
import { RES, RES_KEYS, SHIP, SHIP_KEYS } from '../data/equip.js';
import { IDEO } from '../data/laws.js';
import { fmtDate, fmtNum, pct, clamp } from '../core/util.js';
import { atWar, cn, friendly, sameSide, isAtWar, enemies, surrenderLimit, vpLost } from '../core/diplo.js';
import { divsIn, divsOf, tplFill } from '../core/land.js';
import { availableCivs, freeMil, freeDock, maxManpower } from '../core/economy.js';
import { regionSupplyCap } from '../core/supply.js';
import { focusTree, focusBlocker } from '../core/focus.js';
import { evTitle, evText, evOpts, chooseEvent } from '../core/script.js';
import { actMove, actStop, actSetManual, actPeaceDeal } from '../core/actions.js';
import { fleetSize, setFleetMission, FLEET_MIS, dominance } from '../core/navy.js';
import { MapView, MODES } from './mapview.js';
import { Storage } from './storage.js';
import { $, esc, ic, flag, bar, btn } from './dom.js';

export const PANELS = {};      // name -> { title, render(app, arg) }
export const A = {};           // action name -> handler(app, ...args)

const SPEED_MS = [0, 1400, 650, 300, 120, 0];
const NAV = [
  ['country', 'Страна', 'country'], ['focus', 'Цели', 'focus'], ['research', 'Наука', 'research'], ['build', 'Стройка', 'build'],
  ['prod', 'Заводы', 'prod'], ['army', 'Армия', 'army'], ['air', 'Авиация', 'air'], ['navy', 'Флот', 'navy'], ['diplo', 'Дипломатия', 'diplo'], ['more', 'Ещё', 'more'],
];

export const app = {
  G: null, view: null, speed: 2, paused: true, panel: null, panelArg: null, tabs: {}, pick: null, card: null,
  lastNews: 0, acc: 0, lastHud: 0, lastPanel: 0, full: false, busy: false,

  me() { return this.G && this.G.player ? this.G.ctr[this.G.player] : null; },

  // ---- lifecycle -------------------------------------------------------------------------------
  init() {
    this.view = new MapView($('#map'), {
      onRegion: (r, long) => this.tapRegion(r, long), onSea: (z, long) => this.tapSea(z, long),
      onHit: (h, long) => this.tapHit(h, long), onNothing: () => {},
    });
    $('#nav').innerHTML = NAV.map(([id, label, icon]) => `<button data-a="open|${id}" data-nav="${id}">${ic(icon)}<span>${label}</span></button>`).join('');
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-a]');
      if (!el || el.classList.contains('dis')) return;
      const [name, ...args] = el.dataset.a.split('|');
      const fn = A[name];
      if (fn) { fn(this, ...args, el); this.afterAction(); }
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.G) { this.setPaused(true); this.autosave(); } });
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && this.G && $('#modal').classList.contains('hidden')) { e.preventDefault(); this.setPaused(!this.paused); } });
    window.onAndroidBack = () => this.back();
    let last = performance.now();
    const loop = (now) => { this.step(now - last); last = now; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    this.showMenu('main');
  },
  /** Android back button: close the top-most thing; returns true when handled */
  back() {
    if (!$('#modal').classList.contains('hidden')) return true;
    if (!$('#menu').classList.contains('hidden')) { if (this.menuPage !== 'main') { this.showMenu('main'); return true; } return !!this.G && (this.hideMenu(), true); }
    if (this.pick) { this.cancelPick(); return true; }
    if (this.panel) { this.close(); return true; }
    if (this.card) { this.clearSel(); return true; }
    if (this.G) { this.setPaused(true); this.showMenu('main'); return true; }
    return false;
  },
  begin(G) {
    this.G = G; this.view.G = G;
    this.lastNews = G._newsSeq = G.news.length;
    this.paused = true; this.panel = null; this.card = null; this.pick = null;
    this.view.sel = { region: -1, sea: -1, divs: new Set(), fleet: null, wing: null };
    this.hideMenu();
    $('#panel').classList.add('hidden'); $('#card').classList.add('hidden'); $('#pickbar').classList.add('hidden');
    const me = this.me();
    if (me) {
      const mine = [];
      for (let i = 0; i < NREG; i++) if (G.reg[i].o === me.tag && G.reg[i].core === me.tag) mine.push(i);
      this.view.fitRegions(mine.length ? mine : [me.cap]);
    }
    this.view.invalidate(true);
    this.hud(true); this.timebar(); this.checkEvents();
  },
  newGame(tag, diff) {
    this.begin(startGame(tag, { seed: (Date.now() % 100000) + 7, diff }));
    this.toast('Игра на паузе. Задайте национальную цель, исследования и производство, затем нажмите ▶', 'info', 9000);
  },
  saveTo(slot, silent) {
    const G = this.G;
    if (!G) return false;
    const me = this.me();
    const okk = Storage.save(slot, serialize(G));
    if (okk) Storage.save(slot + '.meta', JSON.stringify({ t: Date.now(), day: G.day, tag: G.player, name: me ? cn(G, me.tag) : 'Наблюдатель', v: VERSION }));
    if (!silent) this.toast(okk ? 'Игра сохранена' : 'Не удалось сохранить игру', okk ? 'good' : 'bad');
    return okk;
  },
  autosave() { if (this.G && this.G.opts.autosave !== false) this.saveTo('auto', true); },
  loadFrom(slot) {
    const s = Storage.load(slot);
    if (!s) { this.toast('Сохранение не найдено', 'bad'); return false; }
    try {
      const G = deserialize(s);
      if (G.v !== VERSION) { this.toast('Сохранение от другой версии игры', 'bad'); return false; }
      this.begin(G);
      this.toast('Игра загружена', 'good');
      return true;
    } catch (e) { console.error(e); this.toast('Сохранение повреждено', 'bad'); return false; }
  },

  // ---- time ------------------------------------------------------------------------------------
  setPaused(p) { this.paused = p; this.acc = 0; this.timebar(); },
  step(dt) {
    const G = this.G;
    if (!G || this.paused || !$('#modal').classList.contains('hidden') || !$('#menu').classList.contains('hidden')) return;
    let n = 0;
    if (this.speed >= 5) {
      const t0 = performance.now();
      do { this.day(); n++; } while (performance.now() - t0 < 12 && !this.paused && n < 6);
    } else {
      this.acc += Math.min(dt, 500);
      const ms = SPEED_MS[this.speed];
      if (this.acc >= ms) { this.acc -= ms; this.day(); n = 1; }
    }
    if (n) { this.view.invalidate(); this.afterTick(); }
  },
  day() {
    const G = this.G;
    try { tick(G); } catch (e) {
      console.error(e);
      this.setPaused(true);
      this.modal({ title: 'Ошибка симуляции', text: esc(String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)), opts: [{ text: 'Понятно' }] });
      return;
    }
    if (G.day % 30 === 0) this.autosave();
    if (G.evq.length) this.checkEvents();
  },
  afterTick() {
    const G = this.G, now = performance.now();
    while (this.lastNews < (G._newsSeq || 0)) {
      const idx = G.news.length - ((G._newsSeq || 0) - this.lastNews);
      this.lastNews++;
      const n = G.news[idx];
      if (n && (n.k !== 'info' || true)) this.toast(n.t, n.k, n.k === 'war' ? 7000 : 4200, n.r);
    }
    if (now - this.lastHud > 240) { this.hud(); this.timebar(); this.lastHud = now; }
    if (this.panel && now - this.lastPanel > 900 && !this.touching) this.renderPanel(true);
    if (this.card && now - this.lastCard > 700) this.renderCard();
    const me = this.me();
    if (G.player && me && !me.alive && !this.over) { this.over = true; this.setPaused(true); this.gameOver(); }
  },
  afterAction() {
    if (!this.G) return;
    this.view.invalidate(true);
    this.hud(true); this.timebar();
    if (this.panel) this.renderPanel(true);
    if (this.card) this.renderCard();
  },

  // ---- HUD -------------------------------------------------------------------------------------
  hud() {
    const G = this.G, c = this.me();
    const top = $('#top');
    if (!G) { top.innerHTML = ''; return; }
    if (!c) { top.innerHTML = `<div class="row"><button class="who" data-a="menu">${ic('menu')}<span>Наблюдатель</span></button><span class="chip">${ic('tension')} ${Math.round(G.tension)}%</span></div>`; $('#alerts').innerHTML = ''; return; }
    const mp = Math.max(0, c.mp);
    const chips1 = [
      `<button class="chip" data-a="open|country">${ic('pp')}<b>${Math.floor(c.pp)}</b></button>`,
      `<button class="chip ${c.stab < 0.35 ? 'bad' : ''}" data-a="open|country">${ic('stab')}${Math.round(c.stab * 100)}%</button>`,
      `<button class="chip" data-a="open|country">${ic('ws')}${Math.round(c.ws * 100)}%</button>`,
      `<button class="chip ${mp < 20 ? 'bad' : ''}" data-a="open|army|recruit">${ic('mp')}${fmtNum(mp * 1000)}</button>`,
      `<button class="chip" data-a="open|diplo">${ic('tension')}${Math.round(G.tension)}%</button>`,
    ];
    const fc = c._civFree ?? availableCivs(c), fm = freeMil(c), fd = freeDock(c);
    const chips2 = [
      `<button class="chip ${fc > 0 && !c.build.length ? 'warn' : ''}" data-a="open|build">${ic('civ')}<b>${c._civ}</b></button>`,
      `<button class="chip ${fm > 0 ? 'warn' : ''}" data-a="open|prod">${ic('mil')}<b>${c._mil}</b></button>`,
      `<button class="chip ${fd > 0 ? 'warn' : ''}" data-a="open|prod|dock">${ic('dock')}<b>${c._dock}</b></button>`,
    ];
    for (const k of RES_KEYS) {
      const b = c._bal ? c._bal[k] : 0;
      chips2.push(`<button class="chip ${b < -0.5 ? 'bad' : ''}" data-a="open|more|trade" title="${RES[k].name}">${ic(k)}${b > 0 ? '+' : ''}${Math.round(b)}</button>`);
    }
    top.innerHTML = `<div class="row"><button class="who" data-a="open|country">${flag(c.tag)}<span>${esc(cn(G, c.tag))}</span></button>${chips1.join('')}</div><div class="row">${chips2.join('')}</div>`;
    this.alerts();
    for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('on', b.dataset.nav === this.panel);
  },
  alerts() {
    const G = this.G, c = this.me();
    const out = [];
    const add = (icon, act, n, cls = '') => out.push(`<button class="${cls}" data-a="${act}">${ic(icon)}${n ? `<i>${n}</i>` : ''}</button>`);
    if (!c.focus.cur && focusTree(c.tag).some((f) => !focusBlocker(G, c, f))) add('focus', 'open|focus');
    const freeSlots = c.rs - c.research.filter(Boolean).length;
    if (freeSlots > 0 && !(c.auto && c.auto.research)) add('research', 'open|research', freeSlots);
    const fc = c._civFree ?? 0;
    if (fc > 0 && !c.build.length && !(c.auto && c.auto.build)) add('build', 'open|build', fc);
    const fm = freeMil(c);
    if (fm > 0 && !(c.auto && c.auto.prod)) add('mil', 'open|prod', fm);
    const fd = freeDock(c);
    if (fd > 0 && !(c.auto && c.auto.prod)) add('dock', 'open|prod|dock', fd);
    let low = 0, cut = 0;
    for (const d of divsOf(G, c.tag)) { if (d.sup <= 0) cut++; else if (d.sup < 0.7) low++; }
    if (cut) add('skull', 'open|army|divs', cut);
    else if (low >= 3) add('supply', 'open|army|divs', low, 'info');
    let planes = 0;
    for (const k of ['fighter', 'cas', 'tac', 'strat', 'nav']) planes += c.stock[k] || 0;
    if (planes >= 40 && !(c.auto && c.auto.air)) add('air', 'open|air', Math.floor(planes), 'info');
    if (c.nukes > 0) add('nuke', 'open|air', c.nukes);
    $('#alerts').innerHTML = out.join('');
  },
  timebar() {
    const G = this.G;
    if (!G) { $('#timebar').innerHTML = ''; return; }
    const pips = '▮'.repeat(this.speed) + '▯'.repeat(5 - this.speed);
    $('#timebar').innerHTML = `<button data-a="speed|-1">${ic('minus')}</button><div class="date" data-a="pause"><span>${fmtDate(G.day)}</span><small>${pips}</small></div><button data-a="speed|1">${ic('plus')}</button><button class="play ${this.paused ? '' : 'run'}" data-a="pause">${ic(this.paused ? 'play' : 'pause')}</button>`;
  },
  toast(text, kind = 'info', ms = 4200, region = -1) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    if (region >= 0) el.onclick = () => { this.view.centerOn(region, Math.max(this.view.cam.s, 0.09)); };
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => el.remove(), ms);
  },
  /** show the result of an action {ok,msg} */
  say(res) { if (res && res.msg) this.toast(res.msg, res.ok ? 'good' : 'bad'); return res && res.ok; },

  // ---- panels ----------------------------------------------------------------------------------
  open(name, arg) {
    if (!this.G) return;
    if (name === this.panel && arg === undefined) { this.close(); return; }
    if (!this.me() && name !== 'more') { this.toast('В режиме наблюдателя доступно только меню «Ещё»', 'info'); return; }
    this.panel = name;
    if (arg !== undefined && arg !== '') this.tabs[name] = arg;
    this.hideCard();
    $('#panel').classList.remove('hidden');
    $('#panel').classList.toggle('full', this.full);
    this.renderPanel(false);
    this.hud();
  },
  close() { this.panel = null; $('#panel').classList.add('hidden'); this.hud(); this.view.sel.wing = null; this.view.invalidate(); },
  renderPanel(keepScroll) {
    const P = PANELS[this.panel];
    if (!P) return;
    const body = $('#panel .pbody');
    const st = keepScroll ? body.scrollTop : 0;
    $('#panel .phead').innerHTML = `<span class="t">${typeof P.title === 'function' ? P.title(this) : P.title}</span><button data-a="full">${ic(this.full ? 'collapse' : 'expand')}</button><button data-a="close">${ic('close')}</button>`;
    let html;
    try { html = P.render(this, this.tabs[this.panel]); } catch (e) { console.error(e); html = `<div class="empty">Ошибка отображения: ${esc(String(e))}</div>`; }
    body.innerHTML = html;
    body.scrollTop = st;
    this.lastPanel = performance.now();
  },

  // ---- map picking -----------------------------------------------------------------------------
  pickRegion(hint, valid, cb) {
    this.pick = { kind: 'region', valid, cb, panel: this.panel };
    this.view.pick = { valid };
    if (this.panel) { $('#panel').classList.add('hidden'); }
    this.hideCard();
    $('#pickbar').innerHTML = `${ic('target')}<span>${esc(hint)}</span>${btn('Отмена', 'cancelpick', 'sm ghost')}`;
    $('#pickbar').classList.remove('hidden');
    this.view.invalidate();
  },
  pickSea(hint, cb) {
    this.pick = { kind: 'sea', cb, panel: this.panel };
    if (this.panel) $('#panel').classList.add('hidden');
    this.hideCard();
    $('#pickbar').innerHTML = `${ic('target')}<span>${esc(hint)}</span>${btn('Отмена', 'cancelpick', 'sm ghost')}`;
    $('#pickbar').classList.remove('hidden');
  },
  cancelPick() {
    const p = this.pick;
    this.pick = null; this.view.pick = null;
    $('#pickbar').classList.add('hidden');
    if (p && p.panel && this.panel === p.panel) { $('#panel').classList.remove('hidden'); this.renderPanel(true); }
    this.view.invalidate();
  },

  // ---- map taps --------------------------------------------------------------------------------
  tapRegion(r, long) {
    const G = this.G;
    if (!G) return;
    if (this.pick) {
      if (this.pick.kind !== 'region') return;
      if (this.pick.valid && !this.pick.valid(r)) { this.toast('Этот регион не подходит', 'bad'); return; }
      const cb = this.pick.cb;
      this.cancelPick();
      cb(r);
      this.afterAction();
      return;
    }
    const sel = this.view.sel;
    const me = this.me();
    if (!long && me && sel.divs.size) {
      const ids = Array.from(sel.divs).filter((id) => G.divs[id]);
      const allHere = ids.every((id) => G.divs[id].r === r);
      if (!allHere) {
        this.say(actMove(G, me.tag, ids, r));
        this.afterAction();
        return;
      }
    }
    sel.region = r; sel.sea = -1; sel.fleet = null;
    if (!long && me && !sel.divs.size) {
      // tapping a region holding our troops selects them straight away
    }
    this.card = { type: 'region', r };
    if (this.panel && !this.full) { /* keep the panel, the card is hidden under it */ }
    this.renderCard();
    this.view.invalidate();
  },
  tapSea(z) {
    const G = this.G;
    if (!G) return;
    if (this.pick) {
      if (this.pick.kind !== 'sea') { this.toast('Нужно выбрать регион на суше', 'bad'); return; }
      const cb = this.pick.cb;
      this.cancelPick();
      cb(z);
      this.afterAction();
      return;
    }
    const sel = this.view.sel;
    const me = this.me();
    if (me && sel.fleet && sel.fleet.o === me.tag && G.fleets.includes(sel.fleet)) {
      const f = sel.fleet;
      const okk = setFleetMission(G, f, f.mis === 'port' ? 'patrol' : f.mis, z);
      this.toast(okk ? `${f.name}: ${FLEET_MIS[f.mis].toLowerCase()} — ${SEA[z].name}` : 'Нет морского пути', okk ? 'good' : 'bad');
    }
    sel.sea = z; sel.region = -1;
    if (sel.divs.size) { /* keep land selection */ }
    this.card = { type: 'sea', z };
    this.renderCard();
    this.view.invalidate();
  },
  tapHit(h, long) {
    const G = this.G, me = this.me();
    if (this.pick) { if (h.type === 'stack' || h.type === 'battle') this.tapRegion(h.r, long); else if (h.type === 'fleet') this.tapSea(h.z); return; }
    const sel = this.view.sel;
    if (h.type === 'stack') {
      if (me && h.o === me.tag && !long) {
        const ids = divsIn(G, h.r).filter((d) => d.o === me.tag && !d.ret).map((d) => d.id);
        const same = ids.length === sel.divs.size && ids.every((id) => sel.divs.has(id));
        if (same) { this.open('sel'); return; }
        sel.divs = new Set(ids); sel.region = h.r; sel.sea = -1; sel.fleet = null;
        this.card = { type: 'sel' };
        this.renderCard(); this.view.invalidate();
        return;
      }
      if (me && sel.divs.size && !long) { this.tapRegion(h.r, false); return; }
      this.tapRegion(h.r, true);
    } else if (h.type === 'battle') {
      if (me && sel.divs.size && !long) { this.tapRegion(h.r, false); return; }
      this.tapRegion(h.r, true);
    } else if (h.type === 'fleet') {
      const f = G.fleets.find((x) => x.zone === h.z && x.o === h.o);
      if (me && h.o === me.tag && f) { sel.fleet = f; sel.divs = new Set(); sel.sea = h.z; sel.region = -1; this.card = { type: 'fleet' }; this.renderCard(); this.view.invalidate(); } else this.tapSea(h.z);
    }
  },
  clearSel() {
    const s = this.view.sel;
    s.divs = new Set(); s.region = -1; s.sea = -1; s.fleet = null;
    this.hideCard(); this.view.invalidate();
  },
  hideCard() { this.card = null; $('#card').classList.add('hidden'); },
  renderCard() {
    const G = this.G, c = this.card, me = this.me();
    const el = $('#card');
    if (!c || !G) { el.classList.add('hidden'); return; }
    this.lastCard = performance.now();
    let h = '';
    const X = `<button class="x btn sm ghost" data-a="clearsel">${ic('close')}</button>`;
    if (c.type === 'region') {
      const i = c.r, r = G.reg[i], R = REG[i];
      const occ = r.c !== r.o;
      h += `<h3>${flag(r.c)} ${esc(R.name)}${X}</h3>`;
      h += `<div class="sub">${esc(cn(G, r.o))}${occ ? ` · <span class="neg">оккупация: ${esc(cn(G, r.c))}</span>` : ''} · ${TERRAIN[R.terrain].name} · нас. ${fmtNum(r.pop * 1000)} · очки ${r.vp}</div>`;
      const b = [];
      if (r.civ) b.push(`${ic('civ')}${r.civ}`); if (r.mil) b.push(`${ic('mil')}${r.mil}`); if (r.dock) b.push(`${ic('dock')}${r.dock}`);
      b.push(`${ic('supply')}инфр. ${r.infra}`);
      if (r.air) b.push(`${ic('air')}${r.air}`); if (r.port) b.push(`${ic('ship')}порт ${r.port}`); if (r.fort) b.push(`${ic('fort')}${r.fort}`); if (r.aa) b.push(`ПВО ${r.aa}`);
      for (const k in r.res) b.push(`${ic(k)}${r.res[k]}`);
      if (r.dmg > 0.03) b.push(`<span class="neg">разрушения ${pct(r.dmg)}</span>`);
      h += `<div class="row" style="flex-wrap:wrap;gap:4px 10px;font-size:13px">${b.join(' ')}</div>`;
      const groups = {};
      for (const d of divsIn(G, i)) groups[d.o] = (groups[d.o] || 0) + 1;
      const gl = Object.keys(groups).map((t) => `${flag(t)} ${groups[t]}`).join(' &nbsp; ');
      if (gl) h += `<div style="margin-top:5px;font-size:13px">Дивизии: ${gl}</div>`;
      const bt = G.battles[i];
      if (bt) h += `<div style="margin-top:5px">${ic('ws')} Сражение: ${flag(bt.att)} ${bt.na} против ${flag(bt.def)} ${bt.nd}, день ${bt.days}${bar(bt.bal, bt.att === (me && me.tag) ? 'g' : 'r')}</div>`;
      const acts = [];
      if (me) {
        const mine = divsIn(G, i).filter((d) => d.o === me.tag && !d.ret).length;
        if (mine) acts.push(btn(`${ic('army')} Выбрать войска (${mine})`, `selreg|${i}`, 'sm blue'));
        if (r.o === me.tag && r.c === me.tag) acts.push(btn(`${ic('build')} Строить`, `buildhere|${i}`, 'sm'));
        if (r.c !== me.tag) acts.push(btn(`${ic('diplo')} ${esc(cn(G, r.c))}`, `diplo|${r.c}`, 'sm'));
        if (this.view.sel.divs.size) acts.push(btn(`${ic('arrow')} Приказ сюда`, `movehere|${i}`, 'sm red'));
      }
      h += `<div class="acts">${acts.join('')}</div>`;
    } else if (c.type === 'sel') {
      const ids = Array.from(this.view.sel.divs).filter((id) => G.divs[id]);
      if (!ids.length) { this.hideCard(); return; }
      let org = 0, str = 0, moving = 0, man = 0;
      const byT = {};
      for (const id of ids) {
        const d = G.divs[id], t = me.tpl[d.t];
        org += d.org / t._s.org; str += d.str; if (d.path.length) moving++; if (d.man) man++;
        byT[t.name] = (byT[t.name] || 0) + 1;
      }
      const r0 = G.divs[ids[0]].r;
      h += `<h3>${flag(me.tag)} Выбрано дивизий: ${ids.length}${X}</h3>`;
      h += `<div class="sub">${esc(REG[r0].name)} · ${Object.keys(byT).map((k) => `${esc(k)} ×${byT[k]}`).join(', ')}</div>`;
      h += `<div class="grid2"><div>Организация ${pct(org / ids.length)}${bar(org / ids.length, 'g')}</div><div>Численность ${pct(str / ids.length)}${bar(str / ids.length)}</div></div>`;
      h += `<div class="muted" style="margin-top:5px">Нажмите на регион на карте — марш или атака. За морем — переброска или десант.</div>`;
      h += `<div class="acts">${btn(`${ic('log')} Список`, 'open|sel', 'sm')}${moving ? btn(`${ic('stop')} Стоп`, 'selstop', 'sm') : ''}${man ? btn(`${ic('auto')} Отдать Генштабу`, 'selauto|0', 'sm') : btn(`${ic('lock')} Держать вручную`, 'selauto|1', 'sm')}</div>`;
    } else if (c.type === 'sea') {
      const z = SEA[c.z];
      h += `<h3>${ic('navy')} ${esc(z.name)}${X}</h3>`;
      const list = G.fleets.filter((f) => f.zone === c.z);
      if (me) { const d = dominance(G, c.z, me.tag); h += `<div class="sub">Господство на море: наши силы ${Math.round(d.own)} · противник ${Math.round(d.foe)}</div>`; }
      if (!list.length) h += '<div class="muted">Кораблей нет</div>';
      for (const f of list) h += `<div style="font-size:13px;margin:2px 0">${flag(f.o)} ${esc(f.name)}: ${fleetSize(f)} кораблей — ${FLEET_MIS[f.mis].toLowerCase()}</div>`;
      if (me) h += `<div class="acts">${btn(`${ic('navy')} Флоты`, 'open|navy', 'sm')}</div>`;
    } else if (c.type === 'fleet') {
      const f = this.view.sel.fleet;
      if (!f || !G.fleets.includes(f)) { this.hideCard(); return; }
      h += `<h3>${flag(f.o)} ${esc(f.name)}${X}</h3>`;
      h += `<div class="sub">${SHIP_KEYS.filter((k) => f.ships[k]).map((k) => `${SHIP[k].short} ${f.ships[k]}`).join(' · ')}</div>`;
      h += `<div style="font-size:13px">${FLEET_MIS[f.mis]}${f.tgt >= 0 ? ': ' + esc(SEA[f.tgt].name) : ''}</div>`;
      h += `<div class="muted" style="margin-top:4px">Нажмите на морскую зону, чтобы направить флот туда.</div>`;
      h += `<div class="acts"><span class="seg">${Object.keys(FLEET_MIS).map((m) => `<button class="${f.mis === m ? 'on' : ''}" data-a="fleetmis|${f.id}|${m}">${FLEET_MIS[m]}</button>`).join('')}</span></div>`;
    }
    el.innerHTML = h;
    el.classList.remove('hidden');
  },

  // ---- pop-ups ---------------------------------------------------------------------------------
  modal(m) {
    this.cur = m;
    const el = $('#modal');
    el.innerHTML = `<div class="box"><h2>${esc(m.title)}</h2><div class="tx">${m.html || esc(m.text || '')}</div><div class="ops">${m.opts.map((o, i) => `<button class="btn ${o.cls || (i === 0 ? '' : 'ghost')}" data-a="modal|${i}"><span>${esc(o.text)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span></button>`).join('')}</div></div>`;
    el.classList.remove('hidden');
  },
  checkEvents() {
    const G = this.G;
    if (!G || !G.evq.length || !$('#modal').classList.contains('hidden')) return;
    const e = G.evq.shift();
    this.setPaused(true);
    if (e.type === 'info') this.modal({ title: e.title, text: e.text, opts: [{ text: 'Продолжить' }] });
    else if (e.type === 'peace') {
      if (!G.ctr[e.loser].alive) { this.checkEvents(); return; }
      this.modal({
        title: 'Мирный договор', text: `${cn(G, e.loser)} повержена. Как поступить с побеждённой страной?`,
        opts: [
          { text: 'Аннексировать', sub: 'Вся оккупированная территория отходит победителям', cls: 'red', fn: () => this.say(actPeaceDeal(G, e.loser, e.main, 'annex')) },
          { text: 'Создать зависимое государство', sub: 'Страна сохраняет коренные земли и вступает в наш альянс', cls: 'blue', fn: () => this.say(actPeaceDeal(G, e.loser, e.main, 'puppet')) },
        ],
      });
    } else if (e.type === 'ev') {
      const opts = evOpts(G, e);
      this.modal({ title: evTitle(G, e), text: evText(G, e), opts: opts.map((o, i) => ({ text: o.text, cls: i === 0 ? '' : 'ghost', fn: () => chooseEvent(G, e, i) })) });
    } else this.checkEvents();
  },
  gameOver() {
    const G = this.G;
    this.modal({
      title: 'Поражение', text: 'Ваше государство прекратило существование. История продолжается без вас.',
      opts: [
        { text: 'Наблюдать за миром', fn: () => { G.player = null; this.begin(G); } },
        { text: 'Главное меню', cls: 'ghost', fn: () => this.showMenu('main') },
      ],
    });
  },

  // ---- main menu -------------------------------------------------------------------------------
  hideMenu() { $('#menu').classList.add('hidden'); },
  showMenu(page) {
    this.menuPage = page;
    const el = $('#menu');
    el.classList.remove('hidden');
    el.innerHTML = `<div class="wrap">${MENU[page](this)}</div>`;
    el.scrollTop = 0;
  },
};

// ---- menu pages ------------------------------------------------------------------------------------
const MAJORS = ['GER', 'SOV', 'ENG', 'FRA', 'ITA', 'JAP', 'USA'];
const BLURB = {
  GER: 'Сильнейшая армия Европы и амбиции без границ. Сложность: средняя.',
  SOV: 'Огромная страна, огромная армия — и чистки накануне войны. Сложность: средняя.',
  ENG: 'Империя, над которой не заходит солнце. Флот решает всё. Сложность: средняя.',
  FRA: 'Расколотая республика за линией Мажино. Сложность: высокая.',
  ITA: 'Новая Римская империя на Средиземном море. Сложность: высокая.',
  JAP: 'Островная империя: война в Китае и удар по Тихому океану. Сложность: высокая.',
  USA: 'Спящий гигант с величайшей промышленностью мира. Сложность: низкая.',
};
const DIFF = { easy: 'Лёгкая', normal: 'Обычная', hard: 'Тяжёлая' };
const MENU = {
  main(app) {
    const has = Storage.list().some((s) => s.name === 'auto');
    return `<div class="logo"><h1>WORLD<b>WAR</b></h1><p>Генштаб · 1936–1948</p></div>
      ${app.G ? `<button class="mbtn pri" data-a="resume">${ic('play')}<span>Вернуться в игру<small>${fmtDate(app.G.day)}</small></span></button>` : ''}
      ${!app.G && has ? `<button class="mbtn pri" data-a="loadslot|auto">${ic('play')}<span>Продолжить<small>Последнее автосохранение</small></span></button>` : ''}
      <button class="mbtn ${app.G || has ? '' : 'pri'}" data-a="menupage|new">${ic('country')}<span>Новая игра<small>Выберите державу 1 января 1936 года</small></span></button>
      <button class="mbtn" data-a="menupage|load">${ic('save')}<span>Загрузить игру</span></button>
      ${app.G ? `<button class="mbtn" data-a="menupage|save">${ic('save')}<span>Сохранить игру</span></button>` : ''}
      <button class="mbtn" data-a="menupage|help">${ic('help')}<span>Как играть</span></button>
      ${Storage.native ? `<button class="mbtn" data-a="exit">${ic('close')}<span>Выход</span></button>` : ''}
      <p style="text-align:center;color:#7f8fa0;font-size:12px;margin-top:22px">Глобальная стратегия эпохи Второй мировой войны.<br>Картографические данные: Natural Earth.</p>`;
  },
  new(app) {
    const pick = app.pickTag || 'GER';
    const diff = app.pickDiff || 'normal';
    const row = (t) => `<button class="ctry ${pick === t ? 'on' : ''}" data-a="picktag|${t}">${flag(t)}<span><b>${esc(COUNTRIES[t].n)}</b><small>${IDEO[COUNTRIES[t].ideo].name}${BLURB[t] ? ' · ' + BLURB[t] : ''}</small></span></button>`;
    const minors = Object.keys(COUNTRIES).filter((t) => !COUNTRIES[t].major && !COUNTRIES[t].dormant).sort((a, b) => (COUNTRIES[b].ind[0] + COUNTRIES[b].ind[1]) - (COUNTRIES[a].ind[0] + COUNTRIES[a].ind[1]));
    return `<div class="back"><button class="mbtn" data-a="menupage|main">${ic('close')}<span>Назад</span></button></div>
      <h3>Сложность</h3><div class="seg">${Object.keys(DIFF).map((d) => `<button class="${diff === d ? 'on' : ''}" data-a="pickdiff|${d}">${DIFF[d]}</button>`).join('')}</div>
      <h3>Великие державы</h3>${MAJORS.map(row).join('')}
      <h3>Остальные страны</h3><div class="mini">${minors.map((t) => `<button class="ctry ${pick === t ? 'on' : ''}" data-a="picktag|${t}">${flag(t)}<span>${esc(COUNTRIES[t].n)}</span></button>`).join('')}</div>
      <div style="position:sticky;bottom:0;padding-top:10px;background:linear-gradient(transparent,#141b23 30%)"><button class="mbtn pri" data-a="startnew">${ic('play')}<span>Начать: ${esc(COUNTRIES[pick].n)}<small>${DIFF[diff]} сложность</small></span></button></div>`;
  },
  load(app) {
    const list = Storage.list().filter((s) => !s.name.startsWith('pref_'));
    return `<div class="back"><button class="mbtn" data-a="menupage|main">${ic('close')}<span>Назад</span></button></div><h3>Сохранения</h3>
      ${list.length ? list.map((s) => `<div class="row"><button class="mbtn" data-a="loadslot|${esc(s.name)}">${s.meta && s.meta.tag ? flag(s.meta.tag) : ic('save')}<span>${s.name === 'auto' ? 'Автосохранение' : 'Ячейка ' + esc(s.name)}<small>${s.meta ? esc(s.meta.name) + ' · ' + fmtDate(s.meta.day) : ''}</small></span></button><button class="mbtn" style="width:56px;justify-content:center" data-a="delslot|${esc(s.name)}">${ic('close')}</button></div>`).join('') : '<p style="color:#9fb0bf">Сохранений пока нет.</p>'}`;
  },
  save(app) {
    const list = Storage.list();
    const slot = (n) => { const s = list.find((x) => x.name === String(n)); return `<button class="mbtn" data-a="saveslot|${n}">${ic('save')}<span>Ячейка ${n}<small>${s && s.meta ? esc(s.meta.name) + ' · ' + fmtDate(s.meta.day) : 'пусто'}</small></span></button>`; };
    return `<div class="back"><button class="mbtn" data-a="menupage|main">${ic('close')}<span>Назад</span></button></div><h3>Сохранить в ячейку</h3>${[1, 2, 3, 4].map(slot).join('')}
      <p style="color:#9fb0bf;font-size:13px">Игра также сохраняется автоматически раз в месяц и при сворачивании приложения.</p>`;
  },
  help() {
    return `<div class="back"><button class="mbtn" data-a="menupage|main">${ic('close')}<span>Назад</span></button></div><div class="help">${HELP}</div>`;
  },
};
export const HELP = `
<h3>Суть игры</h3>
<p>Вы руководите страной с 1 января 1936 года: развиваете промышленность, ведёте исследования, создаёте армию, авиацию и флот, заключаете союзы и ведёте войны. Время идёт по дням; игру можно в любой момент поставить на паузу кнопкой ▶ / ❚❚ внизу справа, кнопки − и + меняют скорость.</p>
<h3>Карта</h3>
<p>Двигайте карту одним пальцем, масштабируйте двумя. Нажатие на регион показывает сведения о нём, долгое нажатие — сведения без отдачи приказа. Кнопка «слои» справа переключает режимы карты: политическая, рельеф, промышленность, снабжение, дипломатия, авиация, флот.</p>
<h3>Первые шаги</h3>
<p>1. <b>Цели</b> — выберите национальную цель (70 дней): она даёт заводы, бонусы или меняет историю.<br>
2. <b>Наука</b> — займите все ячейки исследований.<br>
3. <b>Стройка</b> — поставьте в очередь гражданские заводы (они строят всё остальное), позже — военные.<br>
4. <b>Заводы</b> — распределите военные заводы по линиям: винтовки, артиллерия, танки, самолёты; верфи строят корабли.<br>
5. <b>Армия → Набор</b> — обучайте новые дивизии, пока хватает людей и снаряжения.</p>
<p>Красные кружки слева на карте подсказывают, что требует внимания.</p>
<h3>Война на суше</h3>
<p>По умолчанию войсками управляет <b>Генштаб</b>: во вкладке «Армия → Генштаб» для каждого фронта выберите режим — оборона, наступление или прорыв — и приоритет. Штаб сам распределит дивизии и будет атаковать там, где сил достаточно.</p>
<p>Хотите командовать сами — нажмите на значок войск на карте, затем на регион-цель: дивизии пойдут туда и атакуют, если он занят врагом. Такие дивизии остаются под вашим прямым командованием, пока вы не вернёте их штабу.</p>
<p>Исход боя решают численность, организация (зелёная полоска), снабжение, местность, укрепления, авиация и техника. Дивизия без организации отступает; окружённые и отрезанные от снабжения части гибнут.</p>
<h3>Снабжение</h3>
<p>Регион кормит ограниченное число дивизий (зависит от инфраструктуры и местности). Войска должны иметь сухопутную связь со столицей либо с дружественным портом. За морем снабжение идёт конвоями — берегите транспорты от подводных лодок.</p>
<h3>Авиация и флот</h3>
<p>Самолёты со склада сводятся в авиакрылья и базируются на аэродромах: истребители борются за небо, штурмовики помогают войскам, бомбардировщики разрушают заводы. Флоты патрулируют морские зоны, охраняют конвои или охотятся на чужие. Для десанта на вражеский берег нужно господство на море в зоне высадки.</p>
<h3>Дипломатия</h3>
<p>Политическая власть (флажок вверху) тратится на законы, советников и дипломатию: пакты, гарантии, альянсы, оправдание войны. Мировая напряжённость растёт от агрессии и развязывает руки демократиям.</p>
<h3>Победа</h3>
<p>Страна капитулирует, потеряв большую часть ключевых городов (очки победы). Победитель решает её судьбу: аннексия или зависимое государство. Игра не заканчивается — перекраивайте мир как угодно.</p>
<h3>Министры</h3>
<p>В панели «Страна» можно поручить министрам исследования, строительство, производство, набор войск, авиацию и флот — удобно, если хочется сосредоточиться на главном.</p>`;

// ---- global actions ----------------------------------------------------------------------------------
Object.assign(A, {
  open: (app, name, arg) => app.open(name, arg === undefined || arg instanceof Element ? undefined : arg),
  close: (app) => app.close(),
  full: (app) => { app.full = !app.full; $('#panel').classList.toggle('full', app.full); app.renderPanel(true); },
  tab: (app, panel, tab) => { app.tabs[panel] = tab; },
  pause: (app) => app.setPaused(!app.paused),
  speed: (app, d) => { app.speed = clamp(app.speed + Number(d), 1, 5); app.timebar(); },
  cancelpick: (app) => app.cancelPick(),
  clearsel: (app) => app.clearSel(),
  menu: (app) => { app.setPaused(true); app.showMenu('main'); },
  resume: (app) => app.hideMenu(),
  menupage: (app, p) => app.showMenu(p),
  picktag: (app, t) => { app.pickTag = t; app.showMenu('new'); },
  pickdiff: (app, d) => { app.pickDiff = d; app.showMenu('new'); },
  startnew: (app) => { app.over = false; app.newGame(app.pickTag || 'GER', app.pickDiff || 'normal'); },
  loadslot: (app, s) => { app.over = false; if (!app.loadFrom(s)) app.showMenu('load'); },
  saveslot: (app, s) => { app.saveTo(s); app.showMenu('main'); },
  delslot: (app, s) => { Storage.remove(s); Storage.remove(s + '.meta'); app.showMenu('load'); },
  exit: (app) => { app.autosave(); Storage.exit(); },
  modal: (app, i) => {
    const m = app.cur;
    $('#modal').classList.add('hidden');
    app.cur = null;
    const o = m && m.opts[Number(i)];
    if (o && o.fn) o.fn();
    app.checkEvents();
  },
  zoom: (app, f) => app.view.zoomBy(Number(f)),
  home: (app) => { const me = app.me(); if (me && me.cap >= 0) app.view.centerOn(me.cap, Math.max(app.view.cam.s, 0.08)); },
  modes: (app) => { app.showModes = !app.showModes; app.tools(); },
  mode: (app, m) => { app.view.mode = m; app.showModes = false; app.tools(); app.view.invalidate(); },
  selreg: (app, r) => {
    const G = app.G, me = app.me();
    app.view.sel.divs = new Set(divsIn(G, Number(r)).filter((d) => d.o === me.tag && !d.ret).map((d) => d.id));
    app.card = { type: 'sel' };
  },
  movehere: (app, r) => { const me = app.me(); app.say(actMove(app.G, me.tag, Array.from(app.view.sel.divs), Number(r))); app.card = { type: 'sel' }; },
  selstop: (app) => app.say(actStop(app.G, app.me().tag, Array.from(app.view.sel.divs))),
  selauto: (app, m) => app.say(actSetManual(app.G, app.me().tag, Array.from(app.view.sel.divs), m === '1')),
  fleetmis: (app, id, mis) => {
    const f = app.G.fleets.find((x) => x.id === Number(id));
    if (!f) return;
    if (mis === 'port') setFleetMission(app.G, f, 'port');
    else if (f.tgt >= 0) setFleetMission(app.G, f, mis, f.tgt);
    else { f.mis = mis; app.toast('Теперь нажмите на морскую зону', 'info'); }
  },
});
app.tools = function tools() {
  const v = this.view;
  $('#maptools').innerHTML = `<button data-a="modes" class="${this.showModes ? 'on' : ''}">${ic('layers')}</button><button data-a="zoom|1.5">${ic('plus')}</button><button data-a="zoom|0.667">${ic('minus')}</button><button data-a="home">${ic('home')}</button><button data-a="menu">${ic('menu')}</button>
    ${this.showModes ? `<div id="modes">${Object.keys(MODES).map((m) => `<button class="${v.mode === m ? 'on' : ''}" data-a="mode|${m}">${MODES[m]}</button>`).join('')}</div>` : ''}`;
};
export { friendly, sameSide, isAtWar, enemies, surrenderLimit, vpLost, tplFill, maxManpower, regionSupplyCap, atWar, bar };
