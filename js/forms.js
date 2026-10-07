import { state, saveRow, insertMany, deleteRow } from './db.js';
import { compute, presets, family, kwh, matches, pricePerGram, rub, grams, esc, today } from './calc.js';

const attr = v => esc(v ?? '');
function field(label, input, opts = {}) {
  return `<label class="f ${opts.full ? 'f-full' : ''}"><span class="f-l">${label}${opts.hint ? ` <em class="f-h">${opts.hint}</em>` : ''}</span>${input}</label>`;
}
const num = (name, v, extra = '') => `<input name="${name}" type="number" inputmode="decimal" step="any" min="0" value="${attr(v)}" ${extra}>`;
const date = (name, v) => `<input name="${name}" type="date" value="${attr(v || today())}" required>`;
const actions = (row, label) => `<div class="f-actions f-full">
  <button class="f-submit" type="submit">${label}</button>
  ${row?.id ? '<button class="f-delete" type="button" data-delete>Удалить</button>' : ''}</div>`;

function orderForm(o = {}) {
  const C = compute();
  const avail = C.groups.filter(g => g.left > 0 || g.key === o.plastic).sort((a, b) => a.fam.localeCompare(b.fam) || b.left - a.left);
  // для нового заказа подставляем пластик из последнего заказа
  const lastPlastic = C.orders.at(-1)?.plastic;
  const pick = o.plastic || (lastPlastic && avail.find(g => g.left > 0 && g.spools.some(s => matches(s, lastPlastic)))?.key);
  const opts = avail.map(g => `<option value="${attr(g.key)}" ${g.key === pick ? 'selected' : ''}>${esc(g.key)} · ${grams(g.left)} · ${g.ppg.toFixed(2).replace('.', ',')} ₽/г</option>`);
  if (o.plastic && !C.groups.some(g => g.key === o.plastic)) opts.unshift(`<option value="${attr(o.plastic)}" selected>${esc(o.plastic)}</option>`);
  const t = o.temps || {};
  return `<form class="frm" data-kind="order">
    ${field('Дата', date('ordered_on', o.ordered_on))}
    ${field('Принтер', `<select name="printer_id">${state.printers.map(p => `<option value="${p.id}" ${p.id === o.printer_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`)}
    ${field('Что печатаем', `<input name="item" value="${attr(o.item)}" placeholder="Например, кронштейн для камеры">`, { full: 1 })}
    ${field('Клиент', `<input name="client" value="${attr(o.client)}" placeholder="Имя, откуда пришёл">`, { full: 1 })}
    ${field('Пластик', opts.length ? `<select name="plastic" required>${opts.join('')}</select>` : '<p class="note">Сначала добавьте пластик на склад.</p>', { full: 1, hint: 'спишется с самой старой катушки' })}
    ${field('Вес изделия, г', num('weight', o.weight, 'required placeholder="0"'))}
    ${field('Брак и поддержки, г', num('waste', o.waste ?? 0))}
    ${field('За печать, ₽', num('print_price', o.print_price, 'required placeholder="0"'))}
    ${field('За моделирование, ₽', num('model_price', o.model_price ?? 0))}
    ${field('Предоплата, ₽', num('prepay', o.prepay ?? 0))}
    ${field('Время печати, ч', num('hours', o.hours || '', 'placeholder="0"'))}
    <fieldset class="f-temps f-full"><legend class="f-l">Температуры <em class="f-h">из пресета пластика</em></legend>
      ${field('Сопло, °', num('noz', t.noz))}${field('Стол, °', num('bed', t.bed))}${field('Камера, °', num('ch', t.ch))}
    </fieldset>
    ${field('Заметка', `<textarea name="note" rows="2" placeholder="Настройки, пожелания клиента">${esc(o.note)}</textarea>`, { full: 1 })}
    <div class="f-preview f-full" data-preview></div>
    ${actions(o, o.id ? 'Сохранить изменения' : 'Сохранить заказ')}
  </form>`;
}

function spoolForm(s = {}) {
  return `<form class="frm" data-kind="spool">
    ${field('Пластик', `<input name="name" list="dl-mat" value="${attr(s.name)}" placeholder="PETG, PLA Basic, TPU 95A…" required>`)}
    ${field('Бренд', `<input name="brand" list="dl-brand" value="${attr(s.brand)}" placeholder="MAKO" required>`)}
    ${field('Вес катушки, г', num('weight', s.weight ?? 1000, 'required'))}
    ${field('Цена за катушку, ₽', num('price', s.price, 'required placeholder="0"'))}
    ${s.id ? '' : field('Сколько катушек', `<input name="qty" type="number" inputmode="numeric" value="1" min="1" required>`)}
    ${field('Дата покупки', date('bought_on', s.bought_on))}
    <div class="f-preview f-full" data-preview></div>
    ${actions(s, s.id ? 'Сохранить изменения' : 'Добавить на склад')}
    <datalist id="dl-mat">${[...new Set(state.spools.map(x => x.name))].map(n => `<option value="${attr(n)}">`).join('')}</datalist>
    <datalist id="dl-brand">${[...new Set(state.spools.map(x => x.brand))].map(n => `<option value="${attr(n)}">`).join('')}</datalist>
  </form>`;
}

function extraForm(e = {}) {
  return `<form class="frm" data-kind="extra">
    ${field('Что купили', `<input name="name" value="${attr(e.name)}" required placeholder="Например, сопло 0.4">`, { full: 1 })}
    ${field('Категория', `<input name="category" list="dl-cat" value="${attr(e.category)}" placeholder="Сопла">`)}
    ${field('Цена, ₽', num('price', e.price, 'required placeholder="0"'))}
    ${field('Дата покупки', date('bought_on', e.bought_on))}
    ${actions(e, e.id ? 'Сохранить изменения' : 'Добавить покупку')}
    <datalist id="dl-cat">${[...new Set(state.extras.map(x => x.category))].map(c => `<option value="${attr(c)}">`).join('')}</datalist>
  </form>`;
}

function printerForm(p = {}) {
  return `<form class="frm" data-kind="printer">
    ${field('Модель', `<input name="name" value="${attr(p.name)}" required placeholder="Qidi Plus 4">`, { full: 1 })}
    ${field('Цена, ₽', num('price', p.price, 'required placeholder="0"'))}
    ${field('Дата покупки', date('bought_on', p.bought_on))}
    ${actions(p, p.id ? 'Сохранить изменения' : 'Добавить принтер')}
  </form>`;
}

export const FORMS = {
  order:   { table: 'orders',   make: orderForm,   title: ['Новый заказ', 'Заказ'],             done: ['Заказ сохранён', 'Заказ удалён'] },
  spool:   { table: 'spools',   make: spoolForm,   title: ['Покупка пластика', 'Катушка'],      done: ['Пластик добавлен на склад', 'Катушка удалена'] },
  extra:   { table: 'extras',   make: extraForm,   title: ['Покупка допов', 'Покупка'],         done: ['Покупка сохранена', 'Покупка удалена'] },
  printer: { table: 'printers', make: printerForm, title: ['Новый принтер', 'Принтер'],         done: ['Принтер сохранён', 'Принтер удалён'] },
};

function previewOrder(f) {
  const v = n => +f.elements[n]?.value || 0;
  const key = f.elements.plastic?.value || '';
  const printer = state.printers.find(p => p.id === f.elements.printer_id.value);
  const t = { noz: v('noz'), bed: v('bed'), ch: v('ch') };
  const plasticCost = (v('weight') + v('waste')) * pricePerGram(key);
  const k = kwh(printer, t, v('hours'));
  const energy = k * (+state.settings.tariff || 0);
  const income = v('print_price') + v('model_price');
  const watts = v('hours') ? Math.round(k * 1000 / v('hours')) : 0;
  return `<dl class="pv">
    <dt>Пластик, ${grams(v('weight') + v('waste'))}</dt><dd>−${rub(plasticCost)}</dd>
    <dt>Электричество${watts ? `, ≈${watts} Вт × ${v('hours')} ч` : ''}</dt><dd>${v('hours') ? '−' + rub(energy) : 'укажите время'}</dd>
    <dt>Оплата клиента</dt><dd>${rub(income)}</dd>
    <dt class="pv-t">Чистыми</dt><dd class="pv-t">${rub(income - plasticCost - energy)}</dd>
    ${v('prepay') ? `<dt>Осталось получить</dt><dd>${rub(Math.max(0, income - v('prepay')))}</dd>` : ''}
  </dl>`;
}
function previewSpool(f) {
  const v = n => +f.elements[n]?.value || 0, qty = f.elements.qty ? Math.max(1, v('qty')) : 1;
  if (!v('price') || !v('weight')) return '';
  return `<dl class="pv"><dt>Цена за грамм</dt><dd>${(v('price') / v('weight')).toFixed(2).replace('.', ',')} ₽</dd>
    ${qty > 1 ? `<dt class="pv-t">Итого за ${qty} шт.</dt><dd class="pv-t">${rub(v('price') * qty)}</dd>` : ''}</dl>`;
}

// живой расчёт, пресеты температур, сохранение и удаление
export function wireForm(f, row, onDone, onError) {
  const kind = f.dataset.kind, spec = FORMS[kind], pv = f.querySelector('[data-preview]');
  const applyPreset = () => {
    if (kind !== 'order' || !f.elements.plastic) return;
    const p = presets()[family(f.elements.plastic.value)] || presets().PETG;
    f.elements.noz.value = p.noz; f.elements.bed.value = p.bed; f.elements.ch.value = p.ch;
  };
  const refresh = () => { if (pv) pv.innerHTML = kind === 'order' ? previewOrder(f) : kind === 'spool' ? previewSpool(f) : ''; };
  if (kind === 'order' && !row?.temps) applyPreset();
  f.elements.plastic?.addEventListener('change', () => { applyPreset(); refresh(); });
  f.addEventListener('input', refresh); refresh();

  const busy = on => f.querySelectorAll('button').forEach(b => b.disabled = on);
  f.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm('Удалить запись? Это нельзя отменить.')) return;
    busy(true);
    try { await deleteRow(spec.table, row.id); onDone(spec.done[1]); } catch (e) { busy(false); onError(e); }
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f)), n = k => +d[k] || 0, id = row?.id;
    busy(true);
    try {
      if (kind === 'order') await saveRow('orders', { id, ordered_on: d.ordered_on, item: d.item.trim(), client: d.client.trim(), printer_id: d.printer_id || null,
        plastic: d.plastic, weight: n('weight'), waste: n('waste'), print_price: n('print_price'), model_price: n('model_price'), prepay: n('prepay'),
        hours: n('hours'), temps: { noz: n('noz'), bed: n('bed'), ch: n('ch') }, note: d.note.trim() });
      if (kind === 'spool') {
        const s = { name: d.name.trim(), brand: d.brand.trim(), weight: n('weight'), price: n('price'), bought_on: d.bought_on };
        id ? await saveRow('spools', { id, ...s }) : await insertMany('spools', Array.from({ length: Math.max(1, n('qty')) }, () => ({ ...s })));
      }
      if (kind === 'extra') await saveRow('extras', { id, name: d.name.trim(), category: d.category.trim() || 'Другое', price: n('price'), bought_on: d.bought_on });
      if (kind === 'printer') await saveRow('printers', { id, name: d.name.trim(), price: n('price'), bought_on: d.bought_on });
      onDone(spec.done[0]);
    } catch (err) { busy(false); onError(err); }
  });
}
