// Equipment, battalions, ships, aircraft and default division templates.

export const RES = {
  oil: { name: 'Нефть', col: '#3b3b3b' },
  steel: { name: 'Сталь', col: '#6f7f8f' },
  alu: { name: 'Алюминий', col: '#9fb3bf' },
  rub: { name: 'Каучук', col: '#5f4f3f' },
  tun: { name: 'Вольфрам', col: '#8f6f2f' },
  chr: { name: 'Хром', col: '#7f8faf' },
};
export const RES_KEYS = Object.keys(RES);

/** Land & air equipment produced by military factories. cost = production units per piece. */
export const EQ = {
  rifle:   { name: 'Стрелковое оружие',    short: 'Винтовки',     cost: 0.5, res: { steel: 2 }, kind: 'land', tech: 'rifle' },
  sup:     { name: 'Снаряжение поддержки', short: 'Снаряжение',   cost: 4,   res: { steel: 2, alu: 1 }, kind: 'land', tech: 'supeq' },
  art:     { name: 'Артиллерия',           short: 'Артиллерия',   cost: 3.5, res: { steel: 2, tun: 1 }, kind: 'land', tech: 'art' },
  at:      { name: 'Противотанковые орудия', short: 'ПТО',        cost: 4,   res: { steel: 2, tun: 2 }, kind: 'land', tech: 'at' },
  aa:      { name: 'Зенитные орудия',      short: 'Зенитки',      cost: 4,   res: { steel: 2 }, kind: 'land', tech: 'aa' },
  truck:   { name: 'Грузовики',            short: 'Грузовики',    cost: 2.5, res: { steel: 1, rub: 1 }, kind: 'land', tech: 'mot' },
  ltank:   { name: 'Лёгкие танки',         short: 'Лёгкие танки', cost: 8,   res: { steel: 2, oil: 1 }, kind: 'land', tech: 'ltank' },
  mtank:   { name: 'Средние танки',        short: 'Средние танки', cost: 12, res: { steel: 3, oil: 1, tun: 1 }, kind: 'land', tech: 'mtank' },
  htank:   { name: 'Тяжёлые танки',        short: 'Тяжёлые танки', cost: 25, res: { steel: 4, chr: 2, oil: 1 }, kind: 'land', tech: 'htank' },
  fighter: { name: 'Истребители',          short: 'Истребители',  cost: 24,  res: { alu: 3, rub: 1, oil: 1 }, kind: 'air', tech: 'fighter' },
  cas:     { name: 'Штурмовики',           short: 'Штурмовики',   cost: 22,  res: { alu: 2, rub: 1, oil: 1 }, kind: 'air', tech: 'cas' },
  tac:     { name: 'Тактические бомбардировщики', short: 'Такт. бомб.', cost: 34, res: { alu: 3, rub: 1, oil: 1 }, kind: 'air', tech: 'tac' },
  strat:   { name: 'Стратегические бомбардировщики', short: 'Страт. бомб.', cost: 60, res: { alu: 4, rub: 2, oil: 2 }, kind: 'air', tech: 'strat' },
  nav:     { name: 'Морская авиация',      short: 'Морская авиация', cost: 26, res: { alu: 3, rub: 1, oil: 1 }, kind: 'air', tech: 'nav' },
};
export const LAND_EQ = Object.keys(EQ).filter((k) => EQ[k].kind === 'land');
export const AIR_EQ = Object.keys(EQ).filter((k) => EQ[k].kind === 'air');

/** aircraft stats by type (tier 1); range in km */
export const PLANE = {
  fighter: { range: 750,  atk: 1.0,  def: 1.0,  ground: 0.05, bomb: 0,   naval: 0.1 },
  cas:     { range: 700,  atk: 0.25, def: 0.6,  ground: 1.0,  bomb: 0.05, naval: 0.5 },
  tac:     { range: 1500, atk: 0.3,  def: 0.8,  ground: 0.55, bomb: 0.45, naval: 0.3 },
  strat:   { range: 3200, atk: 0.35, def: 1.2,  ground: 0.1,  bomb: 1.0,  naval: 0.05 },
  nav:     { range: 1400, atk: 0.25, def: 0.7,  ground: 0.1,  bomb: 0.05, naval: 1.0 },
};
export const MISSIONS = {
  sup:  { name: 'Превосходство в воздухе', types: ['fighter'] },
  cas:  { name: 'Поддержка войск',         types: ['cas', 'tac'] },
  bomb: { name: 'Стратегические бомбардировки', types: ['strat', 'tac'] },
  nav:  { name: 'Удары по кораблям',       types: ['nav', 'tac', 'cas'] },
};
export const TIER_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/** Ships built by dockyards */
export const SHIP = {
  convoy: { name: 'Транспорты',  short: 'Конвои',     cost: 70,   res: { steel: 1 }, maxDock: 10, tech: null },
  dd:     { name: 'Эсминцы',     short: 'Эсминцы',    cost: 520,  res: { steel: 2, oil: 1 }, maxDock: 10, tech: 'dd',  pow: 4,  hp: 25,  asw: 8, aa: 1,  cap: 0 },
  ss:     { name: 'Подводные лодки', short: 'Подлодки', cost: 380, res: { steel: 2, oil: 1 }, maxDock: 10, tech: 'ss', pow: 7,  hp: 16,  asw: 0, aa: 0,  cap: 0, sub: 1 },
  cl:     { name: 'Крейсеры',    short: 'Крейсеры',   cost: 1700, res: { steel: 3, chr: 1, oil: 1 }, maxDock: 5, tech: 'cl', pow: 14, hp: 70,  asw: 1, aa: 4,  cap: 0 },
  bb:     { name: 'Линкоры',     short: 'Линкоры',    cost: 5800, res: { steel: 5, chr: 3, oil: 2 }, maxDock: 5, tech: 'bb', pow: 48, hp: 260, asw: 0, aa: 8,  cap: 1 },
  cv:     { name: 'Авианосцы',   short: 'Авианосцы',  cost: 6200, res: { steel: 4, chr: 2, oil: 2, alu: 2 }, maxDock: 5, tech: 'cv', pow: 40, hp: 150, asw: 2, aa: 10, cap: 1, air: 1 },
};
export const SHIP_KEYS = ['dd', 'cl', 'bb', 'cv', 'ss'];

/**
 * Battalion types. Stats at equipment tier 1.
 * sa soft attack, ha hard attack, df defence, br breakthrough, hp, org, w width, spd km/h,
 * hard hardness, arm armour, ap piercing, sup supply use, mp manpower, eq equipment need, main = equipment that scales stats.
 */
export const BAT = {
  inf:   { name: 'Пехота',          sa: 5,  ha: 0.8, df: 21, br: 3,  hp: 25,  org: 60, w: 2, spd: 4,   hard: 0,    arm: 0,  ap: 4,  sup: 0.07, mp: 1000, eq: { rifle: 100 }, main: 'rifle' },
  mil:   { name: 'Ополчение',       sa: 2.5, ha: 0.3, df: 12, br: 1.5, hp: 20, org: 40, w: 2, spd: 4,  hard: 0,    arm: 0,  ap: 2,  sup: 0.05, mp: 1000, eq: { rifle: 60 }, main: 'rifle' },
  cav:   { name: 'Кавалерия',       sa: 5,  ha: 0.8, df: 15, br: 5,  hp: 25,  org: 65, w: 2, spd: 6.4, hard: 0,    arm: 0,  ap: 4,  sup: 0.1,  mp: 1000, eq: { rifle: 110 }, main: 'rifle' },
  mot:   { name: 'Мотопехота',      sa: 5,  ha: 0.8, df: 21, br: 5,  hp: 25,  org: 60, w: 2, spd: 12,  hard: 0.1,  arm: 0,  ap: 4,  sup: 0.11, mp: 1100, eq: { rifle: 100, truck: 35 }, main: 'rifle', tech: 'mot1' },
  art:   { name: 'Артиллерия',      sa: 24, ha: 2,   df: 9,  br: 6,  hp: 0.6, org: 0,  w: 3, spd: 4,   hard: 0,    arm: 0,  ap: 5,  sup: 0.2,  mp: 500,  eq: { art: 36 }, main: 'art' },
  at:    { name: 'ПТ-дивизион',     sa: 4,  ha: 15,  df: 4,  br: 0,  hp: 0.6, org: 0,  w: 1, spd: 4,   hard: 0,    arm: 0,  ap: 60, sup: 0.1,  mp: 500,  eq: { at: 36 }, main: 'at', tech: 'at1' },
  aa:    { name: 'Зенитный дивизион', sa: 3, ha: 7,  df: 4,  br: 1,  hp: 0.6, org: 0,  w: 1, spd: 4,   hard: 0,    arm: 0,  ap: 30, sup: 0.1,  mp: 500,  eq: { aa: 36 }, main: 'aa', tech: 'aa1', antiAir: 18 },
  ltank: { name: 'Лёгкие танки',    sa: 13, ha: 5,   df: 4,  br: 24, hp: 2,   org: 10, w: 2, spd: 10,  hard: 0.8,  arm: 15, ap: 22, sup: 0.2,  mp: 500,  eq: { ltank: 40 }, main: 'ltank', tech: 'ltank1' },
  mtank: { name: 'Средние танки',   sa: 19, ha: 12,  df: 5,  br: 36, hp: 2,   org: 10, w: 2, spd: 8,   hard: 0.9,  arm: 55, ap: 60, sup: 0.22, mp: 500,  eq: { mtank: 40 }, main: 'mtank', tech: 'mtank1' },
  htank: { name: 'Тяжёлые танки',   sa: 18, ha: 15,  df: 7,  br: 40, hp: 2,   org: 10, w: 2, spd: 5,   hard: 0.95, arm: 85, ap: 75, sup: 0.3,  mp: 500,  eq: { htank: 30 }, main: 'htank', tech: 'htank1' },
};
export const BAT_KEYS = Object.keys(BAT);

/** Support companies: flat bonuses for the whole division */
export const SUPC = {
  eng:  { name: 'Сапёры',           mp: 300, eq: { rifle: 10, sup: 30 }, tech: 'eng',  desc: '+окапывание, +10% оборона' },
  rec:  { name: 'Разведка',         mp: 500, eq: { rifle: 40, sup: 10 }, tech: 'rec',  desc: '+10% скорость, +5% атака' },
  sart: { name: 'Артиллерия поддержки', mp: 300, eq: { art: 12 }, tech: 'art1', desc: '+12 атака по пехоте' },
  saa:  { name: 'ПВО поддержки',    mp: 300, eq: { aa: 12 }, tech: 'aa1',   desc: 'защита от авиации' },
  log:  { name: 'Рота снабжения',   mp: 500, eq: { truck: 15, sup: 10 }, tech: 'log', desc: '−20% потребление снабжения' },
};
export const SUPC_KEYS = Object.keys(SUPC);

/** attack scaling per equipment tier (index = tier) */
export const TIER_ATK = [0.75, 1, 1.25, 1.5, 1.8, 2.1];
export const TIER_DEF = [0.85, 1, 1.1, 1.2, 1.32, 1.45];

/** Stock templates. key -> {name, bats, sup} */
export const TEMPLATES = {
  inf:  { name: 'Пехотная дивизия',        bats: { inf: 7, art: 2 }, sup: ['eng'], icon: 'inf' },
  inf2: { name: 'Стрелковая дивизия (усил.)', bats: { inf: 9, art: 3 }, sup: ['eng', 'sart', 'rec'], icon: 'inf' },
  mil:  { name: 'Ополченческая дивизия',   bats: { mil: 6 }, sup: [], icon: 'inf' },
  gar:  { name: 'Гарнизонная бригада',     bats: { inf: 4 }, sup: [], icon: 'inf' },
  cav:  { name: 'Кавалерийская дивизия',   bats: { cav: 5 }, sup: [], icon: 'cav' },
  mot:  { name: 'Моторизованная дивизия',  bats: { mot: 6, art: 1 }, sup: ['eng'], icon: 'mot' },
  ltk:  { name: 'Лёгкая танковая дивизия', bats: { ltank: 3, mot: 2 }, sup: [], icon: 'arm' },
  mtk:  { name: 'Танковая дивизия',        bats: { mtank: 4, mot: 4 }, sup: ['eng', 'rec'], icon: 'arm' },
  htk:  { name: 'Тяжёлая танковая дивизия', bats: { htank: 3, mtank: 2, mot: 3 }, sup: ['eng'], icon: 'arm' },
};

export const MAX_BATS = 20;
export const MAX_WIDTH = 46;
