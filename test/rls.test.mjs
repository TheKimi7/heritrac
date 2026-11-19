// Authorisation checks, run against real Postgres compiled to WebAssembly.
//
// The policies in 0001_init.sql are the whole access control story, so they
// are worth testing rather than reading. Supabase supplies auth.users and
// auth.uid(); both are stubbed here closely enough that the policies under
// test are the ones that ship.
//
// Everything runs as the `authenticated` role, never as the owner of the
// tables, because row level security does not apply to a table's owner and a
// suite run as superuser would pass no matter what the policies said.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (what, cond, extra) => {
  if (cond) { pass++; console.log("PASS " + what); }
  else { fail++; console.log("FAIL " + what + (extra ? "  [" + extra + "]" : "")); }
};

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB   = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333";

const db = await PGlite.create();

// Supabase's own auth surface, reduced to what the policies touch.
await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);

await db.exec(readFileSync("supabase/migrations/0001_init.sql", "utf8"));

await db.exec(`
  insert into auth.users (id, email) values
    ('${ALICE}', 'alice@example.com'),
    ('${BOB}',   'bob@example.com'),
    ('${CAROL}', 'carol@example.com');
  create role authenticated;
  grant usage on schema public, auth to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select on auth.users to authenticated;
  grant execute on all functions in schema public, auth to authenticated;
`);

// Run a statement as a given signed-in user, exactly as PostgREST would.
async function as(uid, sql, params) {
  await db.exec("set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  try {
    return { rows: (await db.query(sql, params)).rows, error: null };
  } catch (e) {
    return { rows: [], error: String(e.message || e) };
  } finally {
    await db.exec("reset role;");
  }
}

const DOC = JSON.stringify({ format: "heritrac", people: [], unions: [] });

/* ------------------------------------------------ a family belongs to one person */

let r = await as(ALICE, "insert into trees (owner_id, name, doc) values ($1,$2,$3) returning id",
  [ALICE, "Alice family", DOC]);
ok("somebody can create their own family", r.rows.length === 1, r.error);
const TREE = r.rows[0]?.id;

r = await as(BOB, "insert into trees (owner_id, name, doc) values ($1,$2,$3) returning id",
  [ALICE, "planted", DOC]);
ok("but not one owned by somebody else", r.rows.length === 0 || !!r.error);

r = await as(ALICE, "select id from trees where id = $1", [TREE]);
ok("the owner can read it back", r.rows.length === 1, r.error);

r = await as(BOB, "select id from trees where id = $1", [TREE]);
ok("a stranger cannot read it", r.rows.length === 0, JSON.stringify(r.rows));

r = await as(BOB, "update trees set name = 'taken' where id = $1 returning id", [TREE]);
ok("a stranger cannot change it", r.rows.length === 0);

r = await as(BOB, "delete from trees where id = $1 returning id", [TREE]);
ok("a stranger cannot delete it", r.rows.length === 0);

/* ------------------------------- signing up is not permission: the central claim */

r = await as(BOB, "insert into tree_members (tree_id, user_id, role) values ($1,$2,'editor') returning user_id",
  [TREE, BOB]);
ok("a signed-in user cannot add themselves to a family", r.rows.length === 0 || !!r.error,
  JSON.stringify(r.rows));

r = await as(BOB, "insert into tree_members (tree_id, user_id, role) values ($1,$2,'viewer') returning user_id",
  [TREE, CAROL]);
ok("nor add anybody else", r.rows.length === 0 || !!r.error);

/* ------------------------------------------------- what an invitation actually gives */

r = await as(ALICE, "insert into tree_members (tree_id, user_id, role) values ($1,$2,'viewer') returning user_id",
  [TREE, BOB]);
ok("the owner can invite a viewer", r.rows.length === 1, r.error);

r = await as(BOB, "select id from trees where id = $1", [TREE]);
ok("the viewer can now read it", r.rows.length === 1, r.error);

r = await as(BOB, "update trees set name = 'viewer edit' where id = $1 returning id", [TREE]);
ok("but a viewer still cannot write", r.rows.length === 0);

r = await as(BOB, "delete from trees where id = $1 returning id", [TREE]);
ok("and cannot delete the family", r.rows.length === 0);

r = await as(BOB, "update tree_members set role = 'editor' where tree_id = $1 and user_id = $2 returning role",
  [TREE, BOB]);
ok("a viewer cannot promote themselves to editor", r.rows.length === 0, JSON.stringify(r.rows));

r = await as(ALICE, "update tree_members set role = 'editor' where tree_id = $1 and user_id = $2 returning role",
  [TREE, BOB]);
ok("only the owner can promote them", r.rows.length === 1, r.error);

r = await as(BOB, "update trees set name = 'editor edit' where id = $1 returning id", [TREE]);
ok("an editor can write", r.rows.length === 1, r.error);

r = await as(BOB, "delete from trees where id = $1 returning id", [TREE]);
ok("an editor still cannot delete the family", r.rows.length === 0);

r = await as(CAROL, "select id from trees where id = $1", [TREE]);
ok("a third party is still shut out", r.rows.length === 0);

/* ----------------------------------------------------------- share links are private */

r = await as(ALICE, "insert into share_links (tree_id, token_hash, can_edit, created_by) values ($1,'hash-a',false,$2) returning id",
  [TREE, ALICE]);
ok("the owner can mint a share link", r.rows.length === 1, r.error);

r = await as(BOB, "select token_hash from share_links where tree_id = $1", [TREE]);
ok("an editor cannot read the family's share links", r.rows.length === 0, JSON.stringify(r.rows));

r = await as(BOB, "insert into share_links (tree_id, token_hash, can_edit, created_by) values ($1,'hash-b',true,$2) returning id",
  [TREE, BOB]);
ok("nor mint one of their own", r.rows.length === 0 || !!r.error);

/* ------------------------------- the owner of a family cannot be handed over */

r = await as(BOB, "update trees set owner_id = $1 where id = $2 returning owner_id", [BOB, TREE]);
ok("an editor cannot make themselves the owner", r.rows.length === 0 || !!r.error,
  JSON.stringify(r.rows));

r = await as(ALICE, "select owner_id from trees where id = $1", [TREE]);
ok("and the family still belongs to whoever made it", r.rows[0]?.owner_id === ALICE,
  JSON.stringify(r.rows));

r = await as(ALICE, "update trees set owner_id = $1 where id = $2 returning owner_id", [CAROL, TREE]);
ok("not even the owner can transfer it, for now", r.rows.length === 0 || !!r.error);

/* ------------------------------------------------- two people editing at once */

r = await as(ALICE, "select rev from trees where id = $1", [TREE]);
const rev = r.rows[0].rev;

r = await as(ALICE, "update trees set doc = $1, rev = rev + 1 where id = $2 and rev = $3 returning rev",
  [DOC, TREE, rev]);
ok("a write based on the current revision is accepted", r.rows.length === 1, r.error);

r = await as(BOB, "update trees set doc = $1, rev = rev + 1 where id = $2 and rev = $3 returning rev",
  [DOC, TREE, rev]);
ok("a write based on a stale revision changes nothing", r.rows.length === 0);

/* ----------------------------------------------------------------- leaving */

r = await as(BOB, "delete from tree_members where tree_id = $1 and user_id = $2 returning user_id", [TREE, BOB]);
ok("a member can remove themselves", r.rows.length === 1, r.error);

r = await as(BOB, "select id from trees where id = $1", [TREE]);
ok("and loses access immediately", r.rows.length === 0);

console.log("\n" + (fail === 0 ? "all " + pass + " authorisation checks pass" : pass + " pass, " + fail + " FAIL"));
process.exit(fail === 0 ? 0 : 1);
