-- ============================================================
-- AI & Beyond 2026 — QR Ticketing System
-- Supabase / Postgres schema
-- No auth/RLS roles — public confirm + scan endpoints, all
-- integrity enforced via atomic functions below.
-- ============================================================

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- ------------------------------------------------------------
-- 1. Single-row table holding global event capacity state
-- ------------------------------------------------------------
create table event_state (
  id               int primary key default 1 check (id = 1), -- enforce single row
  spots_total      int not null default 105,
  spots_left       int not null default 105,
  batch_1_sent_at  timestamptz,        -- set once, when the sheet is uploaded & Batch 1 goes out
  batch_2_opened   boolean not null default false, -- true once Batch 2 links are unlocked for manual sending
  updated_at       timestamptz not null default now()
);

insert into event_state (id, spots_total, spots_left, batch_2_opened)
values (1, 105, 105, false);

-- ------------------------------------------------------------
-- 2. Registrations — one row per person from the uploaded sheet
-- ------------------------------------------------------------
create type reg_status as enum (
  'INVITED', 'PENDING', 'CONFIRMED', 'DECLINED', 'EXPIRED'
);

create type reg_batch as enum ('BATCH_1', 'BATCH_2');

create table registrations (
  id                uuid primary key default gen_random_uuid(),
  sheet_row_order   int not null,               -- original position in uploaded sheet
  batch             reg_batch not null,
  original_email    text not null,              -- from the Google Form upload
  confirm_token     text not null unique,        -- random, used in invite link, single-use
  status            reg_status not null default 'INVITED',

  full_name         text,
  student_number    text,
  wits_email        text,                        -- filled on confirmation; QR sent here

  ticket_id         text unique,                 -- generated only when status -> CONFIRMED
  checked_in_at     timestamptz,

  invited_at        timestamptz not null default now(),
  responded_at      timestamptz,

  created_at        timestamptz not null default now()
);

create index idx_registrations_sheet_order on registrations (sheet_row_order);
create index idx_registrations_status on registrations (status);
create index idx_registrations_batch on registrations (batch);
create index idx_registrations_ticket_id on registrations (ticket_id);
create index idx_registrations_confirm_token on registrations (confirm_token);

-- Optional but recommended: enforce Wits student email domain at the DB level too
-- (in addition to client + server validation on the confirm form).
alter table registrations
  add constraint wits_email_domain
  check (wits_email is null or wits_email ~* '@students\.wits\.ac\.za$');

-- ------------------------------------------------------------
-- 3. Scan audit log — every scan attempt, successful or not
-- ------------------------------------------------------------
create type scan_result as enum ('ADMIT', 'ALREADY_USED', 'INVALID');

create table scan_attempts (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    text not null,
  result       scan_result not null,
  scanned_at   timestamptz not null default now(),
  device_note  text -- freeform, e.g. "door 1 phone" — optional, no auth so just a label
);

create index idx_scan_attempts_ticket_id on scan_attempts (ticket_id);

-- ============================================================
-- 4. Atomic functions — this is the part that has to be exact
-- ============================================================

-- 4a. Confirm attendance: atomically checks capacity, decrements
--     spots_left, marks the registration CONFIRMED, and generates
--     a ticket_id. Returns the updated row, or raises an exception
--     if the token is invalid/already used/no spots left.
create or replace function confirm_registration(
  p_confirm_token text,
  p_full_name text,
  p_student_number text,
  p_wits_email text
) returns registrations as $$
declare
  v_reg registrations;
  v_spots_left int;
begin
  -- Lock the target row to prevent concurrent double-submits on the same token
  select * into v_reg
  from registrations
  where confirm_token = p_confirm_token
  for update;

  if not found then
    raise exception 'INVALID_TOKEN';
  end if;

  if v_reg.status = 'CONFIRMED' then
    raise exception 'ALREADY_CONFIRMED';
  end if;

  if v_reg.status = 'DECLINED' then
    raise exception 'ALREADY_DECLINED';
  end if;

  if v_reg.status = 'EXPIRED' then
    raise exception 'INVITE_EXPIRED';
  end if;

  -- Atomically claim a spot: only succeeds if spots_left > 0
  update event_state
  set spots_left = spots_left - 1,
      updated_at = now()
  where id = 1 and spots_left > 0
  returning spots_left into v_spots_left;

  if v_spots_left is null then
    raise exception 'EVENT_FULL';
  end if;

  update registrations
  set status = 'CONFIRMED',
      full_name = p_full_name,
      student_number = p_student_number,
      wits_email = p_wits_email,
      ticket_id = 'TKT_' || encode(gen_random_bytes(8), 'hex'),
      responded_at = now()
  where id = v_reg.id
  returning * into v_reg;

  return v_reg;
end;
$$ language plpgsql;

-- 4b. Decline attendance: releases the spot immediately if it had
--     somehow already been counted (defensive; normally a PENDING
--     row hasn't consumed a spot yet, since spots are only
--     decremented on CONFIRMED in 4a above).
create or replace function decline_registration(
  p_confirm_token text
) returns registrations as $$
declare
  v_reg registrations;
begin
  select * into v_reg
  from registrations
  where confirm_token = p_confirm_token
  for update;

  if not found then
    raise exception 'INVALID_TOKEN';
  end if;

  if v_reg.status in ('CONFIRMED', 'DECLINED', 'EXPIRED') then
    raise exception 'ALREADY_RESOLVED';
  end if;

  update registrations
  set status = 'DECLINED',
      responded_at = now()
  where id = v_reg.id
  returning * into v_reg;

  return v_reg;
end;
$$ language plpgsql;

-- 4c. Check in a ticket at the door: atomic admit-or-reject, and
--     always writes an audit row regardless of outcome.
create or replace function check_in_ticket(
  p_ticket_id text,
  p_device_note text default null
) returns table (
  result scan_result,
  full_name text,
  checked_in_at timestamptz
) as $$
declare
  v_reg registrations;
begin
  select * into v_reg
  from registrations
  where ticket_id = p_ticket_id
  for update;

  if not found then
    insert into scan_attempts (ticket_id, result, device_note)
    values (p_ticket_id, 'INVALID', p_device_note);
    return query select 'INVALID'::scan_result, null::text, null::timestamptz;
    return;
  end if;

  if v_reg.checked_in_at is not null then
    insert into scan_attempts (ticket_id, result, device_note)
    values (p_ticket_id, 'ALREADY_USED', p_device_note);
    return query select 'ALREADY_USED'::scan_result, v_reg.full_name, v_reg.checked_in_at;
    return;
  end if;

  update registrations
  set checked_in_at = now()
  where id = v_reg.id
  returning * into v_reg;

  insert into scan_attempts (ticket_id, result, device_note)
  values (p_ticket_id, 'ADMIT', p_device_note);

  return query select 'ADMIT'::scan_result, v_reg.full_name, v_reg.checked_in_at;
end;
$$ language plpgsql;

-- ------------------------------------------------------------
-- 5. Handy views for the scanner page's live counter and for
--    sanity-checking batch state without a full dashboard.
-- ------------------------------------------------------------
create view v_event_summary as
select
  (select spots_total from event_state where id = 1) as spots_total,
  (select spots_left from event_state where id = 1) as spots_left,
  count(*) filter (where status = 'CONFIRMED') as confirmed_count,
  count(*) filter (where checked_in_at is not null) as checked_in_count,
  count(*) filter (where batch = 'BATCH_1' and status = 'PENDING') as batch_1_pending,
  count(*) filter (where batch = 'BATCH_1' and status = 'EXPIRED') as batch_1_expired
from registrations;
