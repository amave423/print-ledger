import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// без настроек Supabase сайт работает в демо-режиме: данные из demo-data.json, изменения только в памяти
export const demo = SUPABASE_URL.includes('YOUR_PROJECT');
export const sb = demo ? null : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const state = { printers: [], spools: [], extras: [], orders: [], settings: { tariff: 6.5, presets: {} } };

const TABLES = ['printers', 'spools', 'extras', 'orders'];
const uid = () => crypto.randomUUID();
const stamp = row => ({ created_at: new Date().toISOString(), ...row, id: row.id || uid() });

function check({ data, error }) { if (error) throw error; return data; }

export async function loadAll() {
  if (demo) {
    const res = await fetch('demo-data.json').catch(() => null);
    if (res?.ok) Object.assign(state, await res.json());
    return;
  }
  const [printers, spools, extras, orders, settings] = await Promise.all([
    ...TABLES.map(t => sb.from(t).select('*').then(check)),
    sb.from('settings').select('*').maybeSingle().then(check),
  ]);
  Object.assign(state, { printers, spools, extras, orders });
  if (settings) state.settings = settings;
}

export async function saveRow(table, row) {
  const { id, ...data } = row;
  const saved = demo
    ? stamp({ ...(state[table].find(r => r.id === id) || {}), ...row })
    : id
      ? check(await sb.from(table).update(data).eq('id', id).select().single())
      : check(await sb.from(table).insert(data).select().single());
  const list = state[table], i = list.findIndex(r => r.id === saved.id);
  i >= 0 ? (list[i] = saved) : list.push(saved);
  return saved;
}

export async function insertMany(table, rows) {
  const saved = demo ? rows.map(stamp) : check(await sb.from(table).insert(rows).select());
  state[table].push(...saved);
}

export async function deleteRow(table, id) {
  if (!demo) check(await sb.from(table).delete().eq('id', id));
  state[table] = state[table].filter(r => r.id !== id);
}

export async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  if (demo) return;
  const { tariff, presets } = state.settings;
  state.settings = check(await sb.from('settings').upsert({ tariff, presets }).select().single());
}
