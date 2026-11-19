-- heriTrac v2 schema.
--
-- The shape follows the engine rather than the database's taste: a family is
-- one JSON document, because every kinship term is derived from the document
-- as a whole and nothing server-side ever needs to query inside it. Splitting
-- people and unions into tables would buy queries nobody runs and cost a
-- rewrite of the engine's data layer.
--
-- Authorisation lives here, in policies, not in application code. Every
-- normal read and write runs as the signed-in user so the database decides
-- what they may touch. The one exception is looking up a share link by its
-- token, where there is no signed-in user for a policy to act on.

-- gen_random_uuid() is core Postgres since 13, so no extension is needed.

-- ---------------------------------------------------------------- families

create table public.trees (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Untitled family',
  doc         jsonb not null,
  -- Bumped by every accepted write. A client sends the rev it based its edit
  -- on, and a write carrying a stale rev changes no rows, which is how two
  -- people editing at once is detected rather than one of them being lost.
  rev         integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index trees_owner_idx on public.trees (owner_id);

-- Who else may see or change a family. Roles are deliberately coarse: this
-- is a family tree, not a permissions system.
create table public.tree_members (
  tree_id     uuid not null references public.trees(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('editor', 'viewer')),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (tree_id, user_id)
);

create index tree_members_user_idx on public.tree_members (user_id);

-- A share link. The token itself is never stored: only its SHA-256, so a
-- copy of this table does not hand out working links.
create table public.share_links (
  id          uuid primary key default gen_random_uuid(),
  tree_id     uuid not null references public.trees(id) on delete cascade,
  token_hash  text not null unique,
  can_edit    boolean not null default false,
  created_by  uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index share_links_tree_idx on public.share_links (tree_id);

-- Every accepted write keeps the document it replaced, so vandalism through a
-- shared edit link is recoverable. Trimmed to the most recent few dozen.
create table public.tree_versions (
  tree_id   uuid not null references public.trees(id) on delete cascade,
  rev       integer not null,
  doc       jsonb not null,
  saved_by  uuid references auth.users(id) on delete set null,
  saved_at  timestamptz not null default now(),
  primary key (tree_id, rev)
);

-- ------------------------------------------------------------ access tests
--
-- Only membership is looked up through a function. Ownership is read straight
-- off the row, which matters more than it looks: a policy helper is stable, so
-- it sees the snapshot from the start of the statement, and during an
-- "insert ... returning" the row being inserted is not in that snapshot yet. A
-- helper that re-queried trees to find the owner would refuse to return a
-- family to the very person who had just created it.
--
-- member_role is security definer so that a policy on tree_members may consult
-- tree_members without re-entering its own policy. It is the only place
-- membership is interpreted, so read and write access cannot drift apart.

create or replace function public.member_role(t uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.tree_members where tree_id = t and user_id = auth.uid();
$$;

create or replace function public.owns_tree(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.trees where id = t and owner_id = auth.uid());
$$;

-- A family's owner never changes. Without this an editor could hand the
-- family to themselves in an ordinary update, and the row would still satisfy
-- every policy on the way out.
create or replace function public.freeze_owner()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger trees_freeze_owner
  before update on public.trees
  for each row execute function public.freeze_owner();

-- -------------------------------------------------------------- the policies

alter table public.trees         enable row level security;
alter table public.tree_members  enable row level security;
alter table public.share_links   enable row level security;
alter table public.tree_versions enable row level security;

-- Owners and members read; owners and editors write; only owners delete.
create policy trees_read on public.trees
  for select using (owner_id = auth.uid() or public.member_role(id) is not null);

-- A new family must be created owned by whoever is creating it. Without the
-- check, a signed-in user could plant a tree in somebody else's account.
create policy trees_insert on public.trees
  for insert with check (owner_id = auth.uid());

create policy trees_update on public.trees
  for update using (owner_id = auth.uid() or public.member_role(id) = 'editor')
  with check  (owner_id = auth.uid() or public.member_role(id) = 'editor');

create policy trees_delete on public.trees
  for delete using (owner_id = auth.uid());

-- Membership is the permission, so only the owner may grant it. A member may
-- see who else is on a family, and may remove themselves, and that is all.
-- Signing up gives identity; it never gives access to anything.
create policy members_read on public.tree_members
  for select using (public.owns_tree(tree_id) or public.member_role(tree_id) is not null);

create policy members_insert on public.tree_members
  for insert with check (public.owns_tree(tree_id));

create policy members_update on public.tree_members
  for update using (public.owns_tree(tree_id)) with check (public.owns_tree(tree_id));

create policy members_delete on public.tree_members
  for delete using (public.owns_tree(tree_id) or user_id = auth.uid());

-- Share links are the owner's business alone. Nobody else may list them,
-- mint them or revoke them, and the public lookup by token does not go
-- through here: it runs server side with the secret key.
create policy links_all on public.share_links
  for all using (public.owns_tree(tree_id)) with check (public.owns_tree(tree_id));

-- History is readable by anyone who can read the family, and written by
-- anyone who may change it, as part of an accepted save.
create policy versions_read on public.tree_versions
  for select using (public.owns_tree(tree_id) or public.member_role(tree_id) is not null);

create policy versions_insert on public.tree_versions
  for insert with check (public.owns_tree(tree_id) or public.member_role(tree_id) = 'editor');
