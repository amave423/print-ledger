-- Привязка допов к принтеру. Выполнить один раз в SQL Editor.
alter table extras add column if not exists printer_id uuid references printers on delete set null;
