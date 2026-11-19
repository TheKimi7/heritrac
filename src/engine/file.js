// The family file, and the deliberate absence of a family store.
//
// Nothing is kept in this browser. The tree lives in memory for as long as
// the tab is open and travels only as a JSON file the reader downloads, so
// closing the tab leaves nothing behind on the machine. Earlier builds did
// save to local storage, so `forget()` actively clears anything they left
// rather than ignoring it.
//
// `normalise` is the only way a tree enters the app, and it treats its input
// as somebody else's JSON: it rebuilds the tree field by field rather than
// trusting what arrived. A file may hold the wrong types, ids that point
// nowhere, or property names that mean something to a plain object.
// Every key an older build may have written. All of them go on start.
export const STORE_PREFIX = "heritrac.";

// Files written before naming systems were dropped carry a `settings.pack`.
// They still open: the field is read past and left out of the tree, so such a
// file reads in English like any other, which is the only way to read one now.
//
// A family file is a few kilobytes. Anything on this scale is a mistake or an
// attempt to hang the tab, and both deserve the same answer.
export const MAX_BYTES = 1024 * 1024;
export const MAX_PEOPLE = 2000;
const MAX_TEXT = 200;
const MAX_ID = 120;

// An id naming something on Object.prototype would be read back through every
// plain object the app keys by id, `moved` among them, where "__proto__" comes
// back truthy and positions a card at undefined. Refused once here instead of
// guarded at each use.
const safeKey = (k) => !!k && !(k in Object.prototype);

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function text(v, max) {
  if (typeof v === "string") return v.slice(0, max || MAX_TEXT);
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function int(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n > -10000 && n < 10000 ? n : undefined;
}

// A date is a year, optionally a whole day. A day without a month is dropped,
// since nothing downstream can rank it.
function dateOf(v) {
  if (!isPlain(v)) return undefined;
  const year = int(v.year);
  if (year === undefined) return undefined;
  const out = { year };
  const month = int(v.month);
  if (month >= 1 && month <= 12) out.month = month;
  const day = int(v.day);
  if (out.month && day >= 1 && day <= 31) out.day = day;
  return out;
}

export function normalise(raw) {
  const src = isPlain(raw) ? raw : {};

  const people = [];
  const ids = new Set();
  const incoming = Array.isArray(src.people)
    ? src.people
    : Array.isArray(src.persons)
      ? src.persons
      : [];
  for (const p of incoming) {
    if (people.length >= MAX_PEOPLE) break;
    if (!isPlain(p)) continue;
    const id = text(p.id, MAX_ID);
    if (!safeKey(id) || ids.has(id)) continue;
    ids.add(id);
    const out = { id, name: text(p.name), sex: p.sex === "F" ? "F" : "M" };
    const birth = dateOf(p.birth);
    const death = dateOf(p.death);
    if (birth) out.birth = birth;
    if (death) out.death = death;
    // Dead with no year to put to it. A year of death already says as much,
    // so the flag is only carried when there is no date, which keeps one
    // fact in one place instead of two that can contradict each other.
    else if (p.dead === true) out.dead = true;
    people.push(out);
  }

  // A union holds a couple and their children. One with no spouses is how
  // brothers and sisters hold together before anybody adds the parents, so an
  // empty spouse list is kept rather than treated as a broken union.
  const pick = (list) => {
    const out = [];
    for (const v of Array.isArray(list) ? list : []) {
      const id = text(v, MAX_ID);
      if (ids.has(id) && !out.includes(id)) out.push(id);
    }
    return out;
  };
  const unions = [];
  const seenUnions = new Set();
  for (const u of Array.isArray(src.unions) ? src.unions : []) {
    if (unions.length >= MAX_PEOPLE) break;
    if (!isPlain(u)) continue;
    const id = text(u.id, MAX_ID);
    if (!safeKey(id) || seenUnions.has(id)) continue;
    seenUnions.add(id);
    unions.push({ id, spouses: pick(u.spouses), children: pick(u.children) });
  }

  const inSettings = isPlain(src.settings) ? src.settings : {};
  const ego = text(inSettings.ego, MAX_ID);
  // Whatever `settings.pack` an older file holds is read past here. There is
  // nothing to validate it against any more, and nothing downstream reads it.
  const settings = {
    ego: ids.has(ego) ? ego : people.length ? people[0].id : null
  };

  // A reader's own word for somebody, keyed "viewpoint>person". The ">" is
  // what the app writes, and requiring it here also excludes every inherited
  // property name, since none of them contain one.
  const overrides = {};
  if (isPlain(src.overrides)) {
    for (const key of Object.keys(src.overrides)) {
      if (key.length > MAX_ID * 2 + 1 || key.indexOf(">") < 1) continue;
      const word = text(src.overrides[key]);
      if (word) overrides[key] = word;
    }
  }

  const inMeta = isPlain(src.meta) ? src.meta : {};
  return {
    format: "heritrac",
    version: 1,
    meta: { name: text(inMeta.name, MAX_ID) || "My family" },
    settings,
    overrides,
    people,
    unions
  };
}

export function emptyTree() {
  return normalise({
    meta: { name: "My family" },
    settings: { ego: "me" },
    people: [{ id: "me", name: "Me", sex: "F" }],
    unions: []
  });
}

// Reads a family out of text that came from a file or a paste. Returns the
// tree, or a reason the reader can act on. It never throws.
export function readFamily(raw) {
  if (typeof raw !== "string" || !raw.trim()) return { error: "There is nothing to read there." };
  if (raw.length > MAX_BYTES) {
    return { error: "That file is far too big to be a family. The limit is 1 MB." };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: "That is not a heriTrac family: the file is not valid JSON." };
  }
  const tree = normalise(parsed);
  if (!tree.people.length) return { error: "That file holds nobody this app can read." };
  const claimed = Array.isArray(parsed && parsed.people) ? parsed.people.length : 0;
  return {
    tree,
    dropped: claimed > tree.people.length ? claimed - tree.people.length : 0
  };
}

// Nothing has ever been read back from storage since the privacy change, but
// an older build of this page may have written a tree on this machine. It is
// cleared on start so it does not outlive the version that made it.
export function forget() {
  try {
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf(STORE_PREFIX) === 0) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
    return stale.length;
  } catch (e) {
    // A private window or blocked storage: there was nothing to clear anyway.
    return 0;
  }
}

export function serialise(tree) {
  return JSON.stringify(
    {
      format: "heritrac",
      version: 1,
      meta: { ...tree.meta },
      settings: { ...tree.settings },
      people: tree.people,
      unions: tree.unions,
      ...(Object.keys(tree.overrides || {}).length ? { overrides: tree.overrides } : {})
    },
    null,
    2
  );
}

// What the reader has on screen, as the things worth comparing: the people,
// how they are joined, and the words the reader has chosen. Loading a set of
// words counts as a change to save, because it is one. Only the viewpoint is
// left out, so looking at the family as somebody else is not.
export function fingerprint(tree) {
  return JSON.stringify([tree.people, tree.unions, tree.overrides || {}, (tree.meta || {}).name]);
}

export const fileName = (tree) => {
  // A name of nothing but punctuation sanitises away to an empty string, so
  // the fallback is applied to the slug rather than to the name.
  const slug = text((tree && tree.meta ? tree.meta.name : ""), MAX_ID)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (slug || "family") + ".json";
};

// Inside an iframe a download link does nothing, so the app offers the text
// to copy instead. The caller decides what to do with the answer.
export const embedded = () => {
  try { return window.self !== window.top; } catch (e) { return true; }
};
