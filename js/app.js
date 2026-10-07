import { sb, demo, state, loadAll, saveSettings } from './db.js';
import { compute, presets } from './calc.js';
import { FORMS, wireForm } from './forms.js';
import { ui, viewHome, viewOrders, viewPlastic, viewExtras, viewSettings } from './views.js';

const $ = s => document.querySelector(s);
const VIEWS = { home: viewHome, orders: viewOrders, plastic: viewPlastic, extras: viewExtras, settings: viewSettings };
let email = '';

function render() {
  document.querySelectorAll('[data-go]').forEach(b => b.setAttribute('aria-current', b.dataset.go === ui.screen));
  $('#view').innerHTML = VIEWS[ui.screen](compute(), { demo, email });
}

// экран хранится в адресе (#orders), поэтому работает кнопка «Назад»
function go(screen) {
  if (location.hash !== '#' + screen) location.hash = screen;
  else { render(); scrollTo({ top: 0 }); }
}
addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (!VIEWS[h] || !document.body.classList.contains('ready')) return;
  closeSheet(); ui.screen = h; render(); scrollTo({ top: 0 });
});

function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('bad', bad); t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), bad ? 5000 : 2200);
}
const fail = e => { console.error(e); toast('Не удалось сохранить: ' + (e.message || 'нет связи с базой'), true); };

function openSheet(kind, row) {
  const spec = FORMS[kind], el = $('#sheet');
  el.innerHTML = `<div class="sh-scrim" data-close></div><section class="sh-body" role="dialog" aria-modal="true" aria-label="${spec.title[row ? 1 : 0]}">
    <header class="sh-head"><h2>${spec.title[row ? 1 : 0]}</h2><button class="sh-x" data-close aria-label="Закрыть">✕</button></header>${spec.make(row)}</section>`;
  el.classList.add('on'); document.body.style.overflow = 'hidden';
  const f = el.querySelector('form');
  wireForm(f, row, msg => { closeSheet(); toast(msg); render(); }, fail);
  if (!row) setTimeout(() => f.querySelector('input:not([type=date]),select')?.focus({ preventScroll: true }), 300);
}
function closeSheet() { $('#sheet').classList.remove('on'); document.body.style.overflow = ''; }

async function exportXlsx() {
  if (!window.XLSX) await new Promise((ok, err) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = err; document.head.appendChild(s); });
  const C = compute(), r = n => Math.round(n * 100) / 100, wb = XLSX.utils.book_new();
  const sheet = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  sheet('Заказы', C.orders.map(o => ({ 'Дата': o.ordered_on, 'Изделие': o.item, 'Клиент': o.client, 'Пластик': o.plastic, 'Вес, г': +o.weight, 'Брак, г': +o.waste,
    'За печать': +o.print_price, 'За моделирование': +o.model_price, 'Предоплата': +o.prepay, 'Часы': +o.hours, 'Пластик ушёл, ₽': r(o.cost), 'Электричество, ₽': r(o.energy), 'Чистыми, ₽': r(o.profit), 'Заметка': o.note })));
  sheet('Пластик', C.spools.map(s => ({ 'Дата покупки': s.bought_on, 'Пластик': s.name, 'Бренд': s.brand, 'Вес, г': +s.weight, 'Цена': +s.price, 'Осталось, г': r(s.left) })));
  sheet('Допы', state.extras.map(e => ({ 'Дата покупки': e.bought_on, 'Что': e.name, 'Категория': e.category, 'Цена': +e.price })));
  sheet('Принтеры', state.printers.map(p => ({ 'Дата покупки': p.bought_on, 'Модель': p.name, 'Цена': +p.price })));
  XLSX.writeFile(wb, `учёт-печати-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-go],[data-add],[data-edit],[data-filter],[data-toggle],[data-close],[data-action]');
  if (!t) return;
  const d = t.dataset;
  if (d.go) go(d.go);
  else if (d.add) openSheet(d.add);
  else if (d.edit) { const [kind, id] = d.edit.split(':'); openSheet(kind, state[FORMS[kind].table].find(r => r.id === id)); }
  else if (d.filter) { ui.orderFilter = d.filter; render(); }
  else if (d.toggle) { ui.open.has(d.toggle) ? ui.open.delete(d.toggle) : ui.open.add(d.toggle); render(); }
  else if ('close' in d) closeSheet();
  else if (d.action === 'export') exportXlsx().catch(() => toast('Не удалось загрузить модуль Excel', true));
  else if (d.action === 'logout') { await sb.auth.signOut(); location.reload(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
document.addEventListener('change', async e => {
  const el = e.target;
  try {
    if (el.name === 'tariff') { await saveSettings({ tariff: +el.value || 0 }); toast('Тариф сохранён'); render(); }
    if (el.dataset.preset) {
      const [f, k] = el.dataset.preset.split('.'), p = presets();
      p[f] = { ...p[f], [k]: +el.value || 0 };
      await saveSettings({ presets: p }); toast(`Пресет ${f} сохранён`);
    }
  } catch (err) { fail(err); }
});

async function start() {
  $('#view').innerHTML = '<p class="empty loading">Загружаю данные…</p>';
  try { await loadAll(); } catch (e) { console.error(e); $('#view').innerHTML = `<p class="empty">Не удалось загрузить данные: ${e.message}. Обновите страницу.</p>`; return; }
  document.body.classList.add('ready');
  const h = location.hash.slice(1);
  ui.screen = VIEWS[h] ? h : 'home';
  render();
}

function showLogin() {
  document.body.classList.add('login');
  $('#view').innerHTML = `<form class="login-box" id="login">
    <h1>Вход</h1>
    <label class="f"><span class="f-l">Почта</span><input name="email" type="email" autocomplete="username" required></label>
    <label class="f"><span class="f-l">Пароль</span><input name="password" type="password" autocomplete="current-password" required></label>
    <p class="warn" id="login-err" hidden></p>
    <button class="f-submit" type="submit">Войти</button>
  </form>`;
  $('#login').addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('button');
    btn.disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({ email: d.email, password: d.password });
    btn.disabled = false;
    if (error) { const p = $('#login-err'); p.hidden = false; p.textContent = 'Неверная почта или пароль.'; return; }
    email = data.user.email;
    document.body.classList.remove('login');
    start();
  });
}

if (demo) start();
else {
  const { data } = await sb.auth.getSession();
  if (data.session) { email = data.session.user.email; start(); } else showLogin();
}
