// Every change to a family is a pure function here: it takes a tree and
// returns a new one. Nothing in this file knows about React, the DOM or the
// screen, which is what makes the behaviour testable on its own.

import { parseDate } from "./dates.js";

const clone = (tree) => ({
  ...tree,
  people: tree.people.map((p) => ({ ...p })),
  unions: tree.unions.map((u) => ({ ...u, spouses: [...(u.spouses || [])], children: [...(u.children || [])] })),
  settings: { ...tree.settings },
  overrides: { ...(tree.overrides || {}) }
});

export function newId(tree, name) {
  const base = String(name || "person").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "person";
  const taken = new Set(tree.people.map((p) => p.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(base + "-" + n)) n++;
  return base + "-" + n;
}

function unionId(tree) {
  const taken = new Set(tree.unions.map((u) => u.id));
  let n = tree.unions.length + 1;
  while (taken.has("u" + n)) n++;
  return "u" + n;
}

export function makePerson(tree, draft) {
  const id = draft.id || newId(tree, draft.name);
  const person = { id, name: (draft.name || "Unnamed").trim() || "Unnamed", sex: draft.sex === "F" ? "F" : "M" };
  if (draft.ta) person.ta = draft.ta;
  const born = parseDate(draft.born !== undefined ? draft.born : draft.year);
  if (born) person.birth = born;
  const died = parseDate(draft.died !== undefined ? draft.died : draft.deathYear);
  if (died) person.death = died;
  return person;
}

const parentUnionOf = (tree, id) =>
  tree.unions.find((u) => (u.children || []).includes(id));

export const ownUnionsOf = (tree, id) =>
  tree.unions.filter((u) => (u.spouses || []).includes(id));

// A card on its own, linked to nobody yet. Building a family by dropping
// people down and joining them up afterwards is a perfectly good way to work.
export function addPerson(tree, draft) {
  const next = clone(tree);
  const person = makePerson(next, draft);
  next.people.push(person);
  return { tree: next, id: person.id };
}

export function addParent(tree, childId, draft) {
  const next = clone(tree);
  const person = makePerson(next, draft);
  next.people.push(person);
  const u = parentUnionOf(next, childId);
  if (u) {
    if (u.spouses.length >= 2) return { tree, id: null, error: "Two parents are already recorded." };
    u.spouses.push(person.id);
  } else {
    next.unions.push({ id: unionId(next), spouses: [person.id], children: [childId] });
  }
  return { tree: next, id: person.id };
}

export function addChild(tree, parentId, draft, withUnionId) {
  const next = clone(tree);
  const person = makePerson(next, draft);
  next.people.push(person);
  const own = ownUnionsOf(next, parentId);
  const target = withUnionId
    ? next.unions.find((u) => u.id === withUnionId)
    : own.length === 1 ? own[0] : null;
  if (target) {
    target.children.push(person.id);
  } else if (own.length > 1) {
    return { tree, id: null, error: "Say which marriage this child belongs to." };
  } else {
    next.unions.push({ id: unionId(next), spouses: [parentId], children: [person.id] });
  }
  return { tree: next, id: person.id };
}

export function addSibling(tree, personId, draft, before = false) {
  const next = clone(tree);
  const person = makePerson(next, draft);
  next.people.push(person);
  let u = parentUnionOf(next, personId);
  if (!u) {
    // No parents recorded yet. A union with nobody married into it still
    // binds the children together, and parents can be added to it later.
    u = { id: unionId(next), spouses: [], children: [personId] };
    next.unions.push(u);
  }
  const at = u.children.indexOf(personId);
  u.children.splice(before ? at : at + 1, 0, person.id);
  return { tree: next, id: person.id };
}

export function addSpouse(tree, personId, draft) {
  const next = clone(tree);
  const person = makePerson(next, draft);
  next.people.push(person);
  // Somebody who already has children on their own is waiting for the other
  // parent, so the new partner joins that union rather than starting a
  // separate one and reading as a step-parent.
  const spare = ownUnionsOf(next, personId).find((u) => u.spouses.length === 1);
  if (spare) spare.spouses.push(person.id);
  else next.unions.push({ id: unionId(next), spouses: [personId, person.id], children: [] });
  return { tree: next, id: person.id };
}

/* ------------------------------------------------------- linking two cards */

function ancestors(tree, id, seen = new Set()) {
  const u = parentUnionOf(tree, id);
  if (!u) return seen;
  for (const s of u.spouses) {
    if (seen.has(s)) continue;
    seen.add(s);
    ancestors(tree, s, seen);
  }
  return seen;
}

export function canLink(tree, kind, aId, bId) {
  if (!aId || !bId || aId === bId) return "Pick two different people.";
  const a = tree.people.find((p) => p.id === aId);
  const b = tree.people.find((p) => p.id === bId);
  if (!a || !b) return "That person is not in this family.";
  if (kind === "parent") {
    if (ancestors(tree, aId).has(bId)) return b.name + " is already further up this line.";
    if (ancestors(tree, bId).has(aId)) return "That would make " + b.name + " their own ancestor.";
    const u = parentUnionOf(tree, aId);
    if (u && u.spouses.length >= 2 && !u.spouses.includes(bId)) return "Two parents are already recorded.";
  }
  if (kind === "child") return canLink(tree, "parent", bId, aId);
  if (kind === "spouse") {
    if (ownUnionsOf(tree, aId).some((u) => u.spouses.includes(bId))) return "They are already married.";
    if (ancestors(tree, aId).has(bId) || ancestors(tree, bId).has(aId)) return "They are on the same line of descent.";
    const ua = parentUnionOf(tree, aId);
    const ub = parentUnionOf(tree, bId);
    if (ua && ub && ua.id === ub.id) return "They are brother and sister.";
  }
  if (kind === "sibling") {
    const ua = parentUnionOf(tree, aId);
    const ub = parentUnionOf(tree, bId);
    if (ua && ub && ua.id === ub.id) return "They are already brother and sister.";
    if (ua && ub) return "Both already have parents recorded, so they cannot be made siblings.";
  }
  return null;
}

// kind is read as "b is the <kind> of a".
export function link(tree, kind, aId, bId) {
  const why = canLink(tree, kind, aId, bId);
  if (why) return { tree, error: why };
  if (kind === "child") return link(tree, "parent", bId, aId);
  const next = clone(tree);

  if (kind === "parent") {
    const u = parentUnionOf(next, aId);
    if (u) {
      if (!u.spouses.includes(bId)) u.spouses.push(bId);
    } else {
      const own = ownUnionsOf(next, bId).find((x) => !x.children.length);
      if (own) own.children.push(aId);
      else next.unions.push({ id: unionId(next), spouses: [bId], children: [aId] });
    }
  }
  if (kind === "spouse") {
    const spare = ownUnionsOf(next, aId).find((u) => u.spouses.length === 1);
    if (spare) spare.spouses.push(bId);
    else next.unions.push({ id: unionId(next), spouses: [aId, bId], children: [] });
  }
  if (kind === "sibling") {
    const ua = parentUnionOf(next, aId);
    const ub = parentUnionOf(next, bId);
    if (ua && !ub) ua.children.push(bId);
    else if (ub && !ua) ub.children.push(aId);
    else next.unions.push({ id: unionId(next), spouses: [], children: [aId, bId] });
  }
  return { tree: next };
}

// Undoes whichever direct connection the two of them have. A wrong link is
// easy to make with one careless drag, and deleting a person to get rid of it
// is not a fix.
export function unlink(tree, aId, bId) {
  const next = clone(tree);
  for (const u of next.unions) {
    const aSpouse = u.spouses.includes(aId);
    const bSpouse = u.spouses.includes(bId);
    const aChild = u.children.includes(aId);
    const bChild = u.children.includes(bId);
    if (aSpouse && bSpouse) u.spouses = u.spouses.filter((s) => s !== bId);
    else if (aSpouse && bChild) u.children = u.children.filter((c) => c !== bId);
    else if (bSpouse && aChild) u.children = u.children.filter((c) => c !== aId);
    else if (aChild && bChild) u.children = u.children.filter((c) => c !== bId);
  }
  return { tree: prune(next) };
}

// Everyone the selected person is joined to directly, which is what the panel
// offers to undo.
export function linksOf(tree, id) {
  const out = [];
  const seen = new Set();
  const add = (otherId, how) => {
    if (!otherId || otherId === id || seen.has(otherId)) return;
    seen.add(otherId);
    out.push({ id: otherId, how });
  };
  for (const u of tree.unions) {
    const isSpouse = (u.spouses || []).includes(id);
    const isChild = (u.children || []).includes(id);
    if (isSpouse) {
      for (const s of u.spouses) add(s, "partner");
      for (const c of u.children) add(c, "child");
    }
    if (isChild) {
      for (const s of u.spouses) add(s, "parent");
      for (const c of u.children) add(c, "brother or sister");
    }
  }
  return out;
}

export function removePerson(tree, id) {
  const next = clone(tree);
  next.people = next.people.filter((p) => p.id !== id);
  for (const u of next.unions) {
    u.spouses = u.spouses.filter((s) => s !== id);
    u.children = u.children.filter((c) => c !== id);
  }
  // An override is keyed viewpoint>target. Matching on the whole key, never
  // on a substring, or deleting "sam" would wipe "sam-2" as well.
  for (const key of Object.keys(next.overrides)) {
    const [from, to] = key.split(">");
    if (from === id || to === id) delete next.overrides[key];
  }
  if (next.settings.ego === id) next.settings.ego = (next.people[0] || {}).id || null;
  return prune(next);
}

export function prune(tree) {
  tree.unions = tree.unions.filter((u) => u.spouses.length + u.children.length >= 2 || u.children.length === 1 && u.spouses.length);
  return tree;
}

export function updatePerson(tree, id, patch) {
  const next = clone(tree);
  const p = next.people.find((x) => x.id === id);
  if (!p) return tree;
  if (typeof patch.name === "string" && patch.name.trim()) p.name = patch.name.trim();
  if (patch.sex === "M" || patch.sex === "F") p.sex = patch.sex;
  if ("born" in patch || "year" in patch) {
    const born = parseDate("born" in patch ? patch.born : patch.year);
    if (born) p.birth = born;
    else delete p.birth;
  }
  if ("died" in patch || "deathYear" in patch) {
    const died = parseDate("died" in patch ? patch.died : patch.deathYear);
    if (died) p.death = died;
    else delete p.death;
  }
  // A date of death outranks the flag, so the two can never disagree: the
  // flag is kept only while there is no date to carry the same fact.
  if ("dead" in patch) {
    if (patch.dead === true) p.dead = true;
    else delete p.dead;
  }
  if (p.death) delete p.dead;
  return next;
}

export function setOverride(tree, egoId, targetId, word) {
  const next = clone(tree);
  const key = egoId + ">" + targetId;
  if (word && word.trim()) next.overrides[key] = word.trim();
  else delete next.overrides[key];
  return next;
}
