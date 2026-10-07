import { state } from './db.js';
import { family, famColor, groupKey, rub, grams, dShort, monthName, sum, esc, presets } from './calc.js';

export const ui = { screen: 'home', orderFilter: 'Все', open: new Set() };

const famDot = f => `<i class="dot" style="background:${famColor(f)}"></i>`;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };

export function viewHome(C) {
  const max = Math.max(C.returned, C.invested, 1) * 1.04;
  const over = C.returned - C.invested;
  const cur = C.months[C.months.length - 1], prev = C.months[C.months.length - 2];
  const last = C.months.slice(-7).filter(m => m.key), mmax = Math.max(...last.map(m => m.profit), 1);
  const fams = C.byFam.filter(f => f.weight).sort((a, b) => b.left - a.left), fmax = Math.max(...fams.map(f => f.left), 1);
  const lowCount = C.groups.filter(g => g.low && g.left > 0).length;
  return `
  <section class="card">
    <h2>Окупаемость</h2>
    <p class="pay-big">${over >= 0 ? '+' + rub(over) : rub(-over)}</p>
    <p class="pay-sub">${over >= 0 && C.payDay
      ? `Вложения вернулись <b>${new Date(C.payDay).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</b>, это уже заработано сверху.`
      : 'Осталось получить от клиентов, чтобы вернуть все вложения.'}</p>
    <div class="track">
      <div class="fill" style="width:${C.returned / max * 100}%"></div>
      <div class="mark" style="left:${C.invested / max * 100}%"><span>потрачено ${rub(C.invested)}</span></div>
    </div>
    <div class="track-legend"><span>0</span><span>получено от клиентов ${rub(C.returned)}</span></div>
    <div class="spent">
      <div><small>Принтеры</small><b>${rub(C.spent.printers)}</b></div>
      <div><small>Пластик</small><b>${rub(C.spent.plastic)}</b></div>
      <div><small>Допы</small><b>${rub(C.spent.extras)}</b></div>
      <div><small>Электричество</small><b>${rub(C.spent.energy)}</b></div>
    </div>
  </section>
  <div class="row2">
    <section class="card">
      <h2>Прибыль за ${monthName(cur.key)}<button data-go="orders">Все заказы</button></h2>
      <div class="month-now"><b>${rub(cur.profit)}</b><span>${cur.count ? `${cur.count} ${plural(cur.count, 'заказ', 'заказа', 'заказов')}` : 'заказов пока нет'}</span></div>
      ${prev.key ? `<p class="empty">${cap(monthName(prev.key))}: ${rub(prev.profit)}, ${prev.count} ${plural(prev.count, 'заказ', 'заказа', 'заказов')}</p>` : ''}
      <div class="bars">${last.map((m, i) => `<div class="${i === last.length - 1 ? 'cur' : ''}" title="${rub(m.profit)}"><i style="height:${Math.max(0, m.profit) / mmax * 100}%"></i>${monthName(m.key, 'short')}</div>`).join('')}</div>
    </section>
    <section class="card">
      <h2>Склад пластика${lowCount ? ` · заканчивается: ${lowCount}` : ''}<button data-go="plastic">Подробно</button></h2>
      ${fams.length ? `<div class="stock">${fams.map(f => `<div class="stock-row ${f.left < 300 ? 'low' : ''}"><b>${famDot(f.fam)}${f.fam}</b><span class="meter" style="--c:${famColor(f.fam)}"><i style="width:${f.left / fmax * 100}%"></i></span><small>${f.left > 0 ? grams(f.left) : 'нет'}</small></div>`).join('')}</div>`
        : '<p class="empty">Склад пуст. Добавьте купленные катушки во вкладке «Пластик».</p>'}
    </section>
  </div>`;
}

export function viewOrders(C) {
  const fams = [...new Set(C.orders.map(o => family(o.plastic)))];
  const list = C.orders.filter(o => ui.orderFilter === 'Все' || family(o.plastic) === ui.orderFilter).reverse();
  let lastMonth = '';
  const rows = list.map(o => {
    const m = o.ordered_on.slice(0, 7), head = m !== lastMonth ? `<h3 class="month-h">${cap(monthName(m))} ${m.slice(0, 4)}</h3>` : ''; lastMonth = m;
    const open = ui.open.has(o.id);
    const used = Object.values(o.used.reduce((a, u) => { const k = groupKey(u.spool); (a[k] ||= { k, n: 0, g: 0 }).n++; a[k].g += u.g; return a; }, {}));
    return head + `<article class="ord ${open ? 'is-open' : ''}">
      <button class="ord-main" data-toggle="${o.id}" aria-expanded="${open}">
        <span class="ord-date">${dShort(o.ordered_on)}</span>
        <span class="ord-what"><b>${esc(o.item) || 'Без названия'}</b><small>${famDot(o.plastic)}${esc(o.plastic)} · ${grams(+o.weight)}${o.client ? ` · ${esc(o.client)}` : ''}</small></span>
        <span class="ord-sum"><b>${rub(o.profit)}</b><small>из ${rub(o.income)}</small></span>
      </button>
      ${open ? `<dl class="ord-more">
        <dt>За печать</dt><dd>${rub(o.print_price)}</dd>
        <dt>За моделирование</dt><dd>${+o.model_price ? rub(o.model_price) : '—'}</dd>
        <dt>Пластик ${grams(+o.weight + +(o.waste || 0))}${+o.waste ? ` (брак ${grams(+o.waste)})` : ''}</dt><dd>−${rub(o.cost)}</dd>
        <dt>Электричество${+o.hours ? `, ${o.hours} ч` : ''}</dt><dd>${+o.hours ? '−' + rub(o.energy) : 'время не указано'}</dd>
        ${+o.prepay ? `<dt>Предоплата</dt><dd>${rub(o.prepay)}</dd>` : ''}
        <dt>Катушки</dt><dd>${used.map(x => `${esc(x.k)}${x.n > 1 ? ` ×${x.n}` : ''}, ${grams(x.g)}`).join('<br>') || '—'}${o.short ? `<br><span class="warn">не хватило ${grams(o.short)}</span>` : ''}</dd>
        ${o.temps ? `<dt>Режим</dt><dd>сопло ${o.temps.noz}°, стол ${o.temps.bed}°, камера ${o.temps.ch}°</dd>` : ''}
        ${o.client ? `<dt>Клиент</dt><dd>${esc(o.client)}</dd>` : ''}
        ${o.note ? `<dt>Заметка</dt><dd>${esc(o.note)}</dd>` : ''}
        <dd class="ord-edit"><button class="btn ghost sm" data-edit="order:${o.id}">Изменить</button></dd>
      </dl>` : ''}
    </article>`;
  }).join('');
  return `<div class="page-head"><h1>Заказы</h1><button class="btn" data-add="order">Новый заказ</button></div>
    ${C.orders.length ? `
    <div class="chips">${['Все', ...fams].map(f => `<button class="chip" data-filter="${f}" aria-pressed="${ui.orderFilter === f}">${f !== 'Все' ? famDot(f) : ''}${f}</button>`).join('')}</div>
    <div class="totals"><span>${list.length} ${plural(list.length, 'заказ', 'заказа', 'заказов')}</span><span>${grams(sum(list, o => +o.weight))}</span><span>чистыми ${rub(sum(list, o => o.profit))}</span></div>
    <div class="ord-list">${rows}</div>` : '<p class="empty">Заказов пока нет. Нажмите «Новый заказ», чтобы добавить первый.</p>'}`;
}

export function viewPlastic(C) {
  const fams = C.byFam.sort((a, b) => b.left - a.left);
  return `<div class="page-head"><h1>Пластик</h1><button class="btn" data-add="spool">Купить пластик</button></div>
    ${fams.length ? `<div class="totals"><span>на складе ${grams(sum(C.groups, g => g.left))}</span><span>куплено на ${rub(C.spent.plastic)}</span></div>` : '<p class="empty">Здесь будут все купленные катушки и их остатки.</p>'}
    ${fams.map(f => `<section class="fam">
      <h2 class="fam-h">${famDot(f.fam)}${f.fam}<small>${grams(f.left)} осталось</small></h2>
      ${f.groups.sort((a, b) => b.left - a.left).map(g => { const open = ui.open.has(g.key); return `<article class="grp ${g.left <= 0 ? 'is-empty' : ''} ${g.low && g.left > 0 ? 'is-low' : ''}">
        <button class="grp-main" data-toggle="${esc(g.key)}" aria-expanded="${open}">
          <span class="grp-name"><b>${esc(g.name)}</b><small>${esc(g.brand)} · ${g.ppg.toFixed(2).replace('.', ',')} ₽/г · куплено ${g.spools.length} шт.</small></span>
          <span class="grp-left"><b>${g.left > 0 ? grams(g.left) : 'закончился'}</b><small>${g.left > 0 ? `${g.open} в работе` : ''}${g.low && g.left > 0 ? ' · пора докупить' : ''}</small></span>
          <span class="meter" style="--c:${famColor(g.fam)}"><i style="width:${Math.min(100, g.left / 1000 * 100)}%"></i></span>
        </button>
        ${open ? `<ul class="spool-list">${g.spools.map(s => `<li><button data-edit="spool:${s.id}" aria-label="Изменить катушку">
          <span>${dShort(s.bought_on)} ${s.bought_on.slice(0, 4)}</span><span>${rub(s.price)}</span>
          <span class="meter sm" style="--c:${famColor(g.fam)}"><i style="width:${s.left / s.weight * 100}%"></i></span>
          <span>${s.left > 0 ? grams(s.left) : 'пустая'}</span></button></li>`).join('')}</ul>` : ''}
      </article>`; }).join('')}
    </section>`).join('')}`;
}

export function viewExtras(C) {
  const list = [...state.extras].sort((a, b) => b.bought_on.localeCompare(a.bought_on));
  const cats = {}; list.forEach(e => cats[e.category] = (cats[e.category] || 0) + +e.price);
  return `<div class="page-head"><h1>Допы и расходники</h1><button class="btn" data-add="extra">Добавить покупку</button></div>
    ${list.length ? `
    <div class="cats">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div><small>${esc(c)}</small><b>${rub(v)}</b></div>`).join('')}</div>
    <div class="totals"><span>${list.length} ${plural(list.length, 'покупка', 'покупки', 'покупок')}</span><span>всего ${rub(C.spent.extras)}</span></div>
    <ul class="ex-list">${list.map(e => `<li><button data-edit="extra:${e.id}"><span class="ex-date">${dShort(e.bought_on)} ${e.bought_on.slice(2, 4)}</span><span class="ex-name">${esc(e.name)}<small>${esc(e.category)}</small></span><b>${rub(e.price)}</b></button></li>`).join('')}</ul>`
    : '<p class="empty">Сюда записываются сопла, запчасти, инструменты и прочие покупки для принтера.</p>'}`;
}

export function viewSettings(C, { demo, email }) {
  const pr = presets();
  return `<div class="page-head"><h1>Настройки</h1></div>
    <section class="set">
      <h2>Принтеры</h2>
      ${state.printers.length ? `<ul class="ex-list">${state.printers.map(p => `<li><button data-edit="printer:${p.id}"><span class="ex-date">${dShort(p.bought_on)} ${p.bought_on.slice(2, 4)}</span><span class="ex-name">${esc(p.name)}<small>заработал ${rub(sum(C.orders.filter(o => o.printer_id === p.id), o => o.income))}</small></span><b>${rub(p.price)}</b></button></li>`).join('')}</ul>` : '<p class="note">Добавьте принтер, чтобы считать окупаемость и электричество.</p>'}
      <button class="btn ghost" data-add="printer">Добавить принтер</button>
    </section>
    <section class="set">
      <h2>Электричество</h2>
      <label class="f"><span class="f-l">Цена за 1 кВт·ч, ₽</span><input name="tariff" type="number" inputmode="decimal" step="any" min="0" value="${state.settings.tariff}"></label>
      <p class="note">За всё время ушло примерно ${rub(C.spent.energy)}. Считается только по заказам, где указано время печати.</p>
    </section>
    <section class="set">
      <h2>Пресеты температур</h2>
      <p class="note">Подставляются в новый заказ по типу пластика. В самом заказе их можно поменять.</p>
      <div class="presets"><span></span><small>Сопло</small><small>Стол</small><small>Камера</small>
      ${Object.entries(pr).map(([f, p]) => `<b>${famDot(f)}${f}</b>${['noz', 'bed', 'ch'].map(k => `<input type="number" inputmode="numeric" data-preset="${f}.${k}" value="${p[k]}" aria-label="${f}: ${{ noz: 'сопло', bed: 'стол', ch: 'камера' }[k]}">`).join('')}`).join('')}</div>
    </section>
    <section class="set">
      <h2>Данные</h2>
      <p class="note">${demo ? 'Демо-режим: изменения не сохраняются. Чтобы подключить базу, заполните js/config.js.' : `Вы вошли как ${esc(email)}.`}</p>
      <div class="set-actions"><button class="btn ghost" data-action="export">Скачать в Excel</button>${demo ? '' : '<button class="btn ghost" data-action="logout">Выйти</button>'}</div>
    </section>`;
}
