// National focus engine.
import { focusTree, FOCUS_BY_ID } from '../data/focuses.js';
import { dayOf } from './util.js';
import { news } from './diplo.js';

export function focusBlocker(G, c, f) {
  if (c.focus.done[f.id]) return 'Уже выполнено';
  if (c.focus.cur === f.id) return 'Выполняется';
  for (const r of f.req) if (!c.focus.done[r]) return 'Требуется: ' + (FOCUS_BY_ID[r] ? FOCUS_BY_ID[r].name : r);
  if (f.excl) for (const x of f.excl) if (c.focus.done[x] || c.focus.cur === x) return 'Исключено выбором: ' + FOCUS_BY_ID[x].name;
  if (f.cond && !f.cond(G, c)) return 'Условие: ' + (f.condText || 'не выполнено');
  return null;
}
export function startFocus(G, c, id) {
  const f = FOCUS_BY_ID[id];
  if (!f || focusBlocker(G, c, f)) return false;
  c.focus.cur = id; c.focus.p = 0;
  if (f.prep) { c.ai.prep = {}; for (const t of f.prep) c.ai.prep[t] = 1; c.ai.prepUntil = G.day + f.days + 25; }
  return true;
}
export function focusTick(G, c) {
  const id = c.focus.cur;
  if (!id) return;
  const f = FOCUS_BY_ID[id];
  if (!f) { c.focus.cur = null; return; }
  if (++c.focus.p < f.days) return;
  c.focus.cur = null; c.focus.p = 0;
  c.focus.done[id] = 1;
  if (c.tag === G.player) news(G, `Национальная цель достигнута: ${f.name}`, 'focus');
  // conditions may have changed while the focus was running
  if (!f.cond || f.cond(G, c)) f.eff(G, c);
}
const aiDay = (f) => (f.ai ? dayOf(f.ai[0], f.ai[1], f.ai[2] || 1) : -1);
export function aiFocus(G, c) {
  if (c.focus.cur) return;
  const tree = focusTree(c.tag);
  let due = null, dueDay = 1e9, nextDated = 1e9;
  const fillers = [];
  for (const f of tree) {
    if (c.focus.done[f.id]) continue;
    const d = aiDay(f);
    const blocked = focusBlocker(G, c, f);
    if (d >= 0) {
      if (d <= G.day) { if (!blocked && d < dueDay) { due = f; dueDay = d; } }
      else if (d < nextDated) nextDated = d;
      continue;
    }
    if (blocked) continue;
    if (f.aiCond && !f.aiCond(G, c)) continue;
    fillers.push(f);
  }
  if (due) { startFocus(G, c, due.id); return; }
  if (!fillers.length) return;
  // do not start a long filler when a scheduled focus is about to come up
  const ok = fillers.filter((f) => G.day + f.days <= nextDated + 5);
  if (!ok.length) return;
  let best = ok[0], bs = -1;
  for (const f of ok) { const s = (f.w ?? 1) * (1 + ((f.id.length * 7 + G.day) % 5) * 0.05); if (s > bs) { bs = s; best = f; } }
  startFocus(G, c, best.id);
}
export { focusTree, FOCUS_BY_ID };
