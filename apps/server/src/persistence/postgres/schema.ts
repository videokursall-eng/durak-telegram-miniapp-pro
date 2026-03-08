export const POSTGRES_PERSISTENCE_SCHEMA_SQL = `
create table if not exists users (
  id uuid primary key,
  telegram_user_id text not null unique,
  username text,
  first_name text,
  last_name text,
  photo_url text,
  display_name text not null,
  created_at timestamptz not null,
  last_seen_at timestamptz not null
);

create table if not exists rooms (
  id uuid primary key,
  room_code text not null unique,
  status text not null check (status in ('lobby', 'in_game', 'finished', 'abandoned')),
  host_user_id uuid not null references users(id),
  current_match_id uuid,
  created_at timestamptz not null,
  started_at timestamptz,
  closed_at timestamptz
);

create table if not exists room_memberships (
  id uuid primary key,
  room_id uuid not null references rooms(id),
  user_id uuid not null references users(id),
  player_id text not null,
  player_name text not null,
  room_session_token_hash text not null,
  is_host boolean not null default false,
  join_order integer not null,
  joined_at timestamptz not null,
  left_at timestamptz,
  disconnect_at timestamptz,
  reconnected_at timestamptz
);

create index if not exists room_memberships_room_id_idx on room_memberships(room_id, join_order);
create index if not exists room_memberships_room_token_hash_idx on room_memberships(room_id, room_session_token_hash);

create table if not exists matches (
  id uuid primary key,
  room_id uuid not null references rooms(id),
  mode text not null check (mode in ('simple', 'transfer')),
  status text not null check (status in ('active', 'finished', 'abandoned')),
  started_at timestamptz not null,
  finished_at timestamptz,
  latest_version integer not null,
  latest_snapshot_id uuid,
  loser_user_id uuid references users(id)
);

create index if not exists matches_room_id_idx on matches(room_id, started_at desc);

create table if not exists match_players (
  id uuid primary key,
  match_id uuid not null references matches(id),
  user_id uuid not null references users(id),
  player_id text not null,
  seat_order integer not null,
  display_name_at_match_start text not null,
  finish_place integer,
  is_loser boolean not null default false
);

create index if not exists match_players_match_id_idx on match_players(match_id, seat_order);

create table if not exists match_snapshots (
  id uuid primary key,
  match_id uuid not null references matches(id),
  version integer not null,
  state_json jsonb not null,
  created_at timestamptz not null,
  unique (match_id, version)
);

create index if not exists match_snapshots_match_created_idx
  on match_snapshots(match_id, created_at desc);

create table if not exists match_results (
  id uuid primary key,
  match_id uuid not null unique references matches(id),
  room_id uuid not null references rooms(id),
  mode text not null check (mode in ('simple', 'transfer')),
  winner_user_ids jsonb not null,
  loser_user_id uuid references users(id),
  duration_seconds integer not null,
  finished_at timestamptz not null
);

create table if not exists user_stats (
  user_id uuid primary key references users(id),
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  simple_matches integer not null default 0,
  transfer_matches integer not null default 0,
  last_match_at timestamptz
);

create table if not exists ratings (
  user_id uuid primary key references users(id),
  rating_value integer not null,
  updated_at timestamptz not null
);

create table if not exists rating_history (
  match_id uuid not null references matches(id),
  user_id uuid not null references users(id),
  old_rating integer not null,
  new_rating integer not null,
  delta integer not null,
  primary key (match_id, user_id)
);
`.trim();
