// Laws, advisors, ideologies, buildings.

export const IDEO = {
  dem: { name: 'Демократия', col: '#4c78c4', adj: 'демократическая' },
  fas: { name: 'Фашизм', col: '#6b5b4b', adj: 'фашистская' },
  com: { name: 'Коммунизм', col: '#b23a32', adj: 'коммунистическая' },
  neu: { name: 'Авторитаризм', col: '#8a8a8a', adj: 'нейтральная' },
};
export const IDEO_KEYS = ['dem', 'fas', 'com', 'neu'];

export const LAWS = {
  eco: {
    name: 'Экономика',
    list: [
      { name: 'Гражданская экономика', consumer: 0.30, mods: { milBuild: -0.3, civBuild: -0.3 }, desc: '30% заводов заняты товарами потребления.' },
      { name: 'Ранняя мобилизация', consumer: 0.25, mods: { milBuild: -0.1, civBuild: -0.1 }, need: 'tension10', desc: 'Нужна напряжённость ≥10% (или не демократия).' },
      { name: 'Частичная мобилизация', consumer: 0.20, mods: { milBuild: 0.1 }, need: 'tension25', desc: 'Нужна напряжённость ≥25%, война или тоталитарный режим.' },
      { name: 'Военная экономика', consumer: 0.15, mods: { milBuild: 0.2, civBuild: 0.1 }, need: 'war', desc: 'Только во время войны (или напряжённость ≥60%).' },
      { name: 'Тотальная мобилизация', consumer: 0.10, mods: { milBuild: 0.3, civBuild: 0.2, recruitable: -0.03 }, need: 'totalwar', desc: 'Только во время тяжёлой войны.' },
    ],
  },
  con: {
    name: 'Призыв',
    list: [
      { name: 'Разоружённая нация', mp: 0.01, mods: {}, desc: '1% населения годен к призыву.' },
      { name: 'Добровольческая армия', mp: 0.015, mods: {}, desc: '1,5% населения.' },
      { name: 'Ограниченный призыв', mp: 0.025, mods: {}, need: 'tension10', desc: '2,5% населения.' },
      { name: 'Массовый призыв', mp: 0.05, mods: {}, need: 'tension25', desc: '5% населения.' },
      { name: 'Всеобщая воинская повинность', mp: 0.10, mods: { factoryOutput: -0.1, buildSpeed: -0.1 }, need: 'war', desc: '10% населения; −10% выпуск и строительство.' },
      { name: 'Все взрослые служат', mp: 0.20, mods: { factoryOutput: -0.3, buildSpeed: -0.3 }, need: 'totalwar', desc: '20% населения; −30% выпуск и строительство.' },
    ],
  },
  trd: {
    name: 'Торговля',
    list: [
      { name: 'Свободная торговля', exp: 0.8, mods: { researchSpeed: 0.1, factoryOutput: 0.15, buildSpeed: 0.15 }, desc: '80% ресурсов идёт на рынок.' },
      { name: 'Упор на экспорт', exp: 0.5, mods: { researchSpeed: 0.05, factoryOutput: 0.1, buildSpeed: 0.1 }, desc: '50% ресурсов идёт на рынок.' },
      { name: 'Ограниченный экспорт', exp: 0.25, mods: { factoryOutput: 0.05, buildSpeed: 0.05 }, desc: '25% ресурсов идёт на рынок.' },
      { name: 'Закрытая экономика', exp: 0, mods: {}, desc: 'Все ресурсы остаются в стране.' },
    ],
  },
};
export const LAW_COST = 150;

export const ADVISORS = {
  ind_civ: { name: 'Капитан индустрии', mods: { civBuild: 0.1 }, desc: '+10% строительство гражданских заводов' },
  ind_mil: { name: 'Военный промышленник', mods: { milBuild: 0.1 }, desc: '+10% строительство военных заводов' },
  ind_out: { name: 'Организатор производства', mods: { factoryOutput: 0.05, prodEffCap: 0.05 }, desc: '+5% выпуск, +5% предел эффективности' },
  sci: { name: 'Научный советник', mods: { researchSpeed: 0.07 }, desc: '+7% скорость исследований' },
  prop: { name: 'Министр пропаганды', mods: { warSupport: 0.1 }, desc: '+10% поддержка войны' },
  sec: { name: 'Министр внутренних дел', mods: { stability: 0.1 }, desc: '+10% стабильность' },
  dip: { name: 'Опытный дипломат', mods: { ppGain: 0.15, justifyTime: -0.25 }, desc: '+15% политвласть, −25% время оправдания войны' },
  gen_att: { name: 'Гений наступления', mods: { landAttack: 0.05, breakBonus: 0.05 }, desc: '+5% атака и прорыв' },
  gen_def: { name: 'Мастер обороны', mods: { landDefense: 0.07, entrench: 1 }, desc: '+7% оборона, +1 окапывание' },
  gen_org: { name: 'Начальник штаба', mods: { orgBonus: 0.05, orgRegain: 0.1 }, desc: '+5% организация, +10% её восстановление' },
  air: { name: 'Командующий ВВС', mods: { airAttack: 0.1 }, desc: '+10% атака авиации' },
  nav: { name: 'Адмирал флота', mods: { navalAttack: 0.1 }, desc: '+10% атака флота' },
  quart: { name: 'Генерал-квартирмейстер', mods: { supplyUse: -0.1, attrition: -0.15 }, desc: '−10% потребление снабжения' },
  ideo_dem: { name: 'Либеральный реформатор', mods: { driftDem: 0.1 }, desc: 'Рост поддержки демократии' },
  ideo_fas: { name: 'Националистический агитатор', mods: { driftFas: 0.1 }, desc: 'Рост поддержки фашизма' },
  ideo_com: { name: 'Революционный агитатор', mods: { driftCom: 0.1 }, desc: 'Рост поддержки коммунизма' },
};
export const ADVISOR_COST = 150;
export const MAX_ADVISORS = 4;

/** Buildings. cost in construction points; `slot` buildings share region building slots */
export const BUILD = {
  civ:   { name: 'Гражданский завод', short: 'Гражд. завод', cost: 10800, slot: 1, max: 99, mod: 'civBuild' },
  mil:   { name: 'Военный завод',     short: 'Воен. завод',  cost: 7200,  slot: 1, max: 99, mod: 'milBuild' },
  dock:  { name: 'Верфь',             short: 'Верфь',        cost: 6400,  slot: 1, max: 99, coastal: 1 },
  syn:   { name: 'Завод синтетического топлива', short: 'Синт. завод', cost: 12000, slot: 1, max: 3, unlock: 'syn' },
  infra: { name: 'Инфраструктура',    short: 'Инфраструктура', cost: 4500, max: 5 },
  air:   { name: 'Авиабаза',          short: 'Авиабаза',     cost: 2200,  max: 5 },
  port:  { name: 'Военно-морская база', short: 'Порт',       cost: 3000,  max: 3, coastal: 1 },
  fort:  { name: 'Укрепления',        short: 'Форты',        cost: 2400,  max: 5 },
  aa:    { name: 'ПВО',               short: 'ПВО',          cost: 2000,  max: 5, unlock: 'aa' },
};
export const BUILD_KEYS = Object.keys(BUILD);
