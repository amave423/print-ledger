import { state } from './db.js';

export const DEFAULT_POWER = { base: 35, noz: 0.2, bed: 1.8, ch: 4 };
export const DEFAULT_PRESETS = {
  PLA:  { noz: 215, bed: 60,  ch: 0 },
  PETG: { noz: 240, bed: 80,  ch: 0 },
  ABS:  { noz: 260, bed: 100, ch: 55 },
  ASA:  { noz: 260, bed: 100, ch: 55 },
  PC:   { noz: 275, bed: 110, ch: 60 },
  PA:   { noz: 290, bed: 100, ch: 60 },
  TPU:  { noz: 230, bed: 40,  ch: 0 },
  PP:   { noz: 230, bed: 90,  ch: 0 },
};
const FAM_COLORS = { PETG:'#1E8C8A', PLA:'#4C9F62', ABS:'#D0504A', ASA:'#B5476B', PC:'#5F74D6', PA:'#7A808A', TPU:'#D99A06', PP:'#8A5BB8' };

export const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const family = s => { const m = String(s).toUpperCase().match(/PETG|PLA|ABS|ASA|PC|PA|TPU|PP/); return m ? m[0] : 'Другое'; };
export const famColor = s => FAM_COLORS[family(s)] || '#8D95A1';
export const groupKey = s => `${s.name}, ${s.brand}`;
export const rub = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
export const grams = g => g >= 1000 ? (g / 1000).toFixed(Math.round(g) % 1000 ? 1 : 0).replace('.', ',') + ' кг' : Math.round(g) + ' г';
export const dShort = d => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
export const monthName = (k, len = 'long') => new Date(k + '-01').toLocaleDateString('ru-RU', { month: len }).replace('.', '');
export const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const presets = () => ({ ...DEFAULT_PRESETS, ...(state.settings.presets || {}) });

// примерный расход электричества за печать
export function kwh(printer, t, hours) {
  if (!hours) return 0;
  const p = { ...DEFAULT_POWER, ...(printer?.power || {}) };
  const w = p.base + p.noz * Math.max(0, t.noz - 25) + p.bed * Math.max(0, t.bed - 25) + p.ch * Math.max(0, t.ch - 25);
  return w * hours / 1000 + 0.04 + (t.ch > 0 ? 0.15 : 0);
}

// катушка подходит к заказу: точное «название, бренд» или начало названия (старые записи вида «PETG»)
export const matches = (s, key) => key.includes(',') ? groupKey(s) === key : s.name.toUpperCase().startsWith(key.toUpperCase());

// средняя цена грамма по ключу пластика
export function pricePerGram(key) {
  const list = state.spools.filter(s => matches(s, key));
  return list.length ? sum(list, s => +s.price) / sum(list, s => +s.weight) : 0;
}

export function compute() {
  const left = Object.fromEntries(state.spools.map(s => [s.id, +s.weight]));
  const fifo = [...state.spools].sort((a, b) => a.bought_on.localeCompare(b.bought_on) || String(a.created_at).localeCompare(String(b.created_at)));
  const pre = presets();
  const orders = [...state.orders].sort((a, b) => a.ordered_on.localeCompare(b.ordered_on) || String(a.created_at).localeCompare(String(b.created_at))).map(o => {
    let need = +o.weight + +(o.waste || 0), cost = 0;
    const used = [];
    for (const s of fifo) {
      if (need <= 0) break;
      if (!matches(s, o.plastic) || left[s.id] <= 0) continue;
      const take = Math.min(need, left[s.id]);
      left[s.id] -= take; need -= take; cost += take * s.price / s.weight; used.push({ spool: s, g: take });
    }
    const short = need > 0 ? need : 0;
    if (short) cost += short * pricePerGram(o.plastic);
    const printer = state.printers.find(p => p.id === o.printer_id) || state.printers[0];
    const t = o.temps || pre[family(o.plastic)] || pre.PETG;
    const energy = kwh(printer, t, +o.hours) * (+state.settings.tariff || 0);
    const income = +o.print_price + +(o.model_price || 0);
    return { ...o, cost, energy, income, profit: income - cost - energy, used, short };
  });

  const spools = state.spools.map(s => ({ ...s, left: left[s.id] }));
  const groups = {};
  for (const s of spools) {
    const k = groupKey(s);
    const g = groups[k] ||= { key: k, name: s.name, brand: s.brand, fam: family(s.name), weight: 0, left: 0, spools: [], cost: 0 };
    g.weight += +s.weight; g.left += s.left; g.cost += +s.price; g.spools.push(s);
  }
  Object.values(groups).forEach(g => {
    g.spools.sort((a, b) => a.bought_on.localeCompare(b.bought_on));
    g.open = g.spools.filter(s => s.left > 0).length; g.ppg = g.cost / g.weight; g.low = g.left < 300;
  });
  const byFam = {};
  Object.values(groups).forEach(g => { const f = byFam[g.fam] ||= { fam: g.fam, left: 0, weight: 0, groups: [] }; f.left += g.left; f.weight += g.weight; f.groups.push(g); });

  const spent = {
    printers: sum(state.printers, p => +p.price),
    extras: sum(state.extras, e => +e.price),
    plastic: sum(state.spools, s => +s.price),
    energy: sum(orders, o => o.energy),
  };
  const invested = spent.printers + spent.extras + spent.plastic + spent.energy;
  const returned = sum(orders, o => o.income);
  let run = 0, payDay = null;
  for (const o of orders) { run += o.income; if (!payDay && run >= invested) payDay = o.ordered_on; }

  const months = {};
  for (const o of orders) { const k = o.ordered_on.slice(0, 7); const m = months[k] ||= { key: k, income: 0, profit: 0, count: 0 }; m.income += o.income; m.profit += o.profit; m.count++; }
  const monthList = [];
  const keys = Object.keys(months).sort();
  const end = today().slice(0, 7);
  if (keys.length) {
    let [y, m] = keys[0].split('-').map(Number);
    for (;;) { const k = `${y}-${String(m).padStart(2, '0')}`; monthList.push(months[k] || { key: k, income: 0, profit: 0, count: 0 }); if (k >= end) break; if (++m > 12) { m = 1; y++; } }
  } else monthList.push({ key: end, income: 0, profit: 0, count: 0 });
  if (monthList.length < 2) monthList.unshift({ key: '', income: 0, profit: 0, count: 0 });

  return { orders, spools, groups: Object.values(groups), byFam: Object.values(byFam), invested, returned, spent, payDay, months: monthList };
}
