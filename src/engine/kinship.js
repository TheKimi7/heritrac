// kinship.js
// Works out what one person is to another from the shape of the graph alone.
// It knows nothing about any language: the words come from a pack (packs.js).
//
// The only stored facts are parent, spouse, sex and birth year. A term, the
// side of the family someone sits on, and whether they are elder or younger
// are all derived, which is why changing who you view from re-labels
// everything at no cost.

import { dateKey, yearsBetween, today } from "./dates.js";

export const THIS_YEAR = new Date().getFullYear();

/* ------------------------------------------------------------------ index */

export function buildIndex(data) {
  const people = data.people || data.persons || [];
  const unions = data.unions || [];
  const persons = new Map(people.map((p) => [p.id, p]));
  const unionMap = new Map(unions.map((u) => [u.id, u]));
  const parentsOf = new Map();
  const childrenOf = new Map();
  const spousesOf = new Map();
  const unionsOf = new Map();

  for (const id of persons.keys()) {
    parentsOf.set(id, []);
    childrenOf.set(id, []);
    spousesOf.set(id, []);
    unionsOf.set(id, []);
  }
  for (const u of unionMap.values()) {
    const sp = (u.spouses || []).filter((s) => persons.has(s));
    const ch = (u.children || []).filter((c) => persons.has(c));
    for (const s of sp) {
      unionsOf.get(s).push(u.id);
      for (const t of sp) if (t !== s && !spousesOf.get(s).includes(t)) spousesOf.get(s).push(t);
    }
    for (const c of ch) {
      unionsOf.get(c).push(u.id);
      for (const s of sp) {
        if (!parentsOf.get(c).includes(s)) parentsOf.get(c).push(s);
        if (!childrenOf.get(s).includes(c)) childrenOf.get(s).push(c);
      }
    }
  }
  // A union can hold children with no parent recorded yet, which is what you
  // get the moment somebody adds a brother before adding the parents. Those
  // children still have to know about each other, or the path from one to the
  // other does not exist and they come out as strangers.
  const siblingsOf = new Map();
  for (const id of persons.keys()) siblingsOf.set(id, []);
  for (const u of unionMap.values()) {
    if ((u.spouses || []).filter((s) => persons.has(s)).length) continue;
    const ch = (u.children || []).filter((c) => persons.has(c));
    for (const a of ch) {
      for (const b of ch) if (a !== b && !siblingsOf.get(a).includes(b)) siblingsOf.get(a).push(b);
    }
  }

  const ix = { persons, unions: unionMap, parentsOf, childrenOf, spousesOf, unionsOf, siblingsOf };
  const levels = computeGenerations(ix);
  ix.generation = levels.gen;
  // Which island of the graph each person is on. A card nobody has linked up
  // yet is an island of one, and the drawing has to know that before it can
  // decide what row to put it on.
  ix.component = levels.comp;
  return ix;
}

// Parent and child edges are hard: a child sits one level below each parent.
// Spouse edges are soft, used only to bring two otherwise separate families
// onto the same rows, so a marriage across generations does not drag everyone
// else out of line.
function computeGenerations(ix) {
  const gen = new Map();
  const comp = new Map();
  const members = new Map();
  let next = 0;

  for (const id of ix.persons.keys()) {
    if (comp.has(id)) continue;
    const cid = next++;
    members.set(cid, [id]);
    comp.set(id, cid);
    gen.set(id, 0);
    const queue = [id];
    while (queue.length) {
      const a = queue.shift();
      for (const p of ix.parentsOf.get(a)) {
        if (comp.has(p)) continue;
        comp.set(p, cid); gen.set(p, gen.get(a) + 1); members.get(cid).push(p); queue.push(p);
      }
      for (const k of ix.childrenOf.get(a)) {
        if (comp.has(k)) continue;
        comp.set(k, cid); gen.set(k, gen.get(a) - 1); members.get(cid).push(k); queue.push(k);
      }
    }
  }

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 64) {
    changed = false;
    for (const u of ix.unions.values()) {
      const sp = (u.spouses || []).filter((s) => ix.persons.has(s));
      for (let i = 1; i < sp.length; i++) {
        const ca = comp.get(sp[0]);
        const cb = comp.get(sp[i]);
        if (ca === undefined || cb === undefined || ca === cb) continue;
        const shift = gen.get(sp[0]) - gen.get(sp[i]);
        for (const m of members.get(cb)) {
          gen.set(m, gen.get(m) + shift);
          comp.set(m, ca);
          members.get(ca).push(m);
        }
        members.set(cb, []);
        changed = true;
      }
    }
  }
  return { gen, comp };
}

/* ------------------------------------------------------------------ paths */

export function neighbours(ix, id) {
  const out = [];
  for (const p of ix.parentsOf.get(id)) out.push([ix.persons.get(p).sex === "F" ? "M" : "F", p]);
  for (const k of ix.childrenOf.get(id)) out.push([ix.persons.get(k).sex === "F" ? "D" : "S", k]);
  for (const s of ix.spousesOf.get(id)) out.push([ix.persons.get(s).sex === "F" ? "W" : "H", s]);
  for (const b of (ix.siblingsOf.get(id) || [])) out.push([ix.persons.get(b).sex === "F" ? "Z" : "B", b]);
  return out;
}

// Every simple path out to the reach limit, grouped by who it ends at. A
// family with any cousin or in-law marriage is not a tree, so one person is
// often reachable several ways, and more than one of those ways can be right.
// Far enough for a cousin on the other side of a seven generation family:
// up to the common ancestor and back down again.
export const MAX_STEPS = 24;

export function findPaths(ix, egoId, maxLen = 6, keepPer = 8) {
  const found = new Map([[egoId, [{ steps: [], nodes: [egoId] }]]]);
  let frontier = [{ steps: [], nodes: [egoId] }];
  // How many steps the search may take before it gives up. This, and not
  // maxLen, is what actually limits a big family: the search walks simple
  // paths rather than shortest ones, so the work grows exponentially with
  // depth and the budget runs out long before the length does. Measured on
  // branching clans, resolving from one leaf:
  //
  //     people   budget 60000      budget 250000
  //         94   54 unnameable     0, 11ms
  //        382  337 unnameable     0, 280ms
  //       1457 1352 unnameable     0, 284ms
  //
  // Raising maxLen without raising this changes nothing at all: at 60000 a
  // maxLen of 100 names exactly the same people as a maxLen of 14. Past this
  // the cost climbs roughly in step with the budget and buys nothing until a
  // tree is deeper than about seven generations, where no affordable budget
  // wins. See "How far it reaches" in the README.
  let budget = 250000;

  for (let depth = 0; depth < maxLen && frontier.length && budget > 0; depth++) {
    const nextFrontier = [];
    for (const path of frontier) {
      const last = path.nodes[path.nodes.length - 1];
      for (const [step, nb] of neighbours(ix, last)) {
        if (budget-- <= 0) break;
        if (path.nodes.includes(nb)) continue;
        const grown = { steps: path.steps.concat(step), nodes: path.nodes.concat(nb) };
        if (!found.has(nb)) found.set(nb, []);
        if (found.get(nb).length < keepPer) found.get(nb).push(grown);
        nextFrontier.push(grown);
      }
    }
    frontier = nextFrontier;
  }
  return found;
}

/* --------------------------------------------------------------- reduction */

export function reduce(path, rewrites) {
  let steps = path.steps.slice();
  let nodes = path.nodes.slice();
  let guard = 0;
  let again = true;

  while (again && guard++ < 48) {
    again = false;
    scan: for (let i = 0; i < steps.length; i++) {
      for (const [pat, rep] of rewrites) {
        if (i + pat.length > steps.length) continue;
        let hit = true;
        for (let j = 0; j < pat.length; j++) {
          if (steps[i + j] !== pat[j]) { hit = false; break; }
        }
        if (!hit) continue;
        // A rewrite holds looking down or sideways, not looking up. Your
        // uncle's son may be your brother in Tamil, but his mother is still
        // not your mother.
        const after = steps[i + pat.length];
        if (after === "F" || after === "M") continue;
        steps = steps.slice(0, i).concat(rep, steps.slice(i + pat.length));
        nodes = nodes.slice(0, i + 1).concat(nodes.slice(i + pat.length - rep.length + 1));
        again = true;
        break scan;
      }
    }
  }
  return { steps, nodes };
}

/* ------------------------------------------------------------------- terms */

export function birthYear(p) {
  return p && p.birth && typeof p.birth.year === "number" ? p.birth.year : null;
}

// Somebody can be known to have died without anybody knowing when, which is
// ordinary once a family goes back far enough. A year of death says so on its
// own; the flag is for when there is no year to give.
export function isDead(p) {
  if (!p) return false;
  if (p.death && typeof p.death.year === "number") return true;
  return p.dead === true;
}

export function ageOf(p) {
  if (!p || !p.birth || typeof p.birth.year !== "number") return null;
  // Counting a dead person's age up to today would be wrong, and there is no
  // date to count to instead, so their age is simply not known.
  if (isDead(p) && !(p.death && typeof p.death.year === "number")) return null;
  const end = p.death && typeof p.death.year === "number" ? p.death : today();
  return yearsBetween(p.birth, end);
}

// 1 if a is elder, -1 if younger, 0 if there is nothing to decide it with.
function elderThan(ix, aId, bId) {
  const a = ix.persons.get(aId);
  const b = ix.persons.get(bId);
  // The whole date when both of them have one, the year otherwise.
  const ka = a ? dateKey(a.birth) : null;
  const kb = b ? dateKey(b.birth) : null;
  if (ka !== null && kb !== null && ka !== kb) return ka < kb ? 1 : -1;
  if (a && b && typeof a.order === "number" && typeof b.order === "number" && a.order !== b.order) {
    return a.order < b.order ? 1 : -1;
  }
  return 0;
}

export function halfSibling(ix, egoId, targetId) {
  const a = ix.parentsOf.get(egoId) || [];
  const b = ix.parentsOf.get(targetId) || [];
  const shared = a.filter((p) => b.includes(p)).length;
  return shared === 1 && a.length > 1 && b.length > 1;
}

function applyRule(ix, rule, nodes, half) {
  const base = { verify: !!rule.verify, note: rule.note, alt: rule.alt };
  if (half && rule.half) return { ...base, t: rule.half, ta: rule.halfTa };
  if (!rule.age) return { ...base, t: rule.t, ta: rule.ta };

  const [ai, bi] = rule.age;
  const cmp = ai < nodes.length && bi < nodes.length ? elderThan(ix, nodes[ai], nodes[bi]) : 0;
  if (cmp === 1) return { ...base, t: rule.elder.t, ta: rule.elder.ta, verify: base.verify || !!rule.elder.v };
  if (cmp === -1) return { ...base, t: rule.younger.t, ta: rule.younger.ta, verify: base.verify || !!rule.younger.v };
  return {
    ...base,
    t: rule.elder.t + " or " + rule.younger.t.toLowerCase(),
    ta: rule.elder.ta && rule.younger.ta ? rule.elder.ta + " / " + rule.younger.ta : undefined,
    verify: true,
    unresolved: "age",
    note: "A birth year on either person would settle which of the two this is."
  };
}

function findRule(pack, key, ctx) {
  let loose = null;
  for (const r of pack.rules) {
    if (r.p !== key) continue;
    if (r.when && !r.when(ctx)) continue;
    if (r.ego) {
      if (r.ego === ctx.egoSex) return r;
      continue;
    }
    if (!loose) loose = r;
  }
  return loose;
}

function basicStep(pack, ix, step, nodes, atIndex) {
  const basic = pack.basics[step];
  if (!basic) return { t: step };
  if (basic.age) {
    const cmp = elderThan(ix, nodes[atIndex + 1], nodes[atIndex]);
    if (cmp === 1) return basic.elder;
    if (cmp === -1) return basic.younger;
    return { t: basic.elder.t + "/" + basic.younger.t, ta: undefined };
  }
  return typeof basic === "string" ? { t: basic } : basic;
}

// Exact rule, then whatever the pack can compute, then the longest prefix that
// has a rule with the rest chained on. Every language does the chaining trick
// past a certain distance: no one has a single word for your mother's uncle's
// daughter's son.
export function label(pack, ix, canon, ctx) {
  const key = canon.steps.join(".");
  const exact = findRule(pack, key, ctx);
  if (exact) return { ...applyRule(ix, exact, canon.nodes, ctx.half), key, composed: false };

  if (pack.fallback) {
    const got = pack.fallback({ ...ctx, steps: canon.steps, nodes: canon.nodes, ix });
    if (got) return { ...got, key, composed: false };
  }

  for (let n = canon.steps.length - 1; n >= 1; n--) {
    const at = { ...ctx, target: canon.nodes[n] };
    const rule = findRule(pack, canon.steps.slice(0, n).join("."), at);
    if (!rule) continue;
    const head = applyRule(ix, rule, canon.nodes.slice(0, n + 1), false);
    const tail = canon.steps.slice(n).map((s, i) => basicStep(pack, ix, s, canon.nodes, n + i));
    const join = pack.joiner || " ";
    return {
      t: [head.t, ...tail.map((x) => x.t)].join(join),
      ta: head.ta && tail.every((x) => x.ta) ? [head.ta, ...tail.map((x) => x.ta)].join(" ") : undefined,
      verify: !!head.verify,
      note: head.note,
      key,
      composed: true
    };
  }

  const parts = canon.steps.map((s, i) => basicStep(pack, ix, s, canon.nodes, i));
  return {
    t: parts.map((x) => x.t).join(pack.joiner || " ") || "You",
    ta: parts.every((x) => x.ta) ? parts.map((x) => x.ta).join(" ") : undefined,
    verify: true,
    key,
    composed: true
  };
}

/* ------------------------------------------------------- side and ranking */

// Shortest reduced path wins. Blood beats marriage at the same length, and a
// marriage step in the middle of a chain counts for less than one at the end.
function score(raw, canon) {
  let mid = 0;
  let affinal = 0;
  canon.steps.forEach((s, i) => {
    if (s !== "H" && s !== "W") return;
    affinal++;
    if (i < canon.steps.length - 1) mid += 2;
  });
  return canon.steps.length * 10 + affinal * 3 + mid + raw.steps.length;
}

// Which branch of the family you would go looking in. Decided from the
// reduced path, so a sister's husband reads as married in rather than as
// whichever parent the walk happened to start from.
export function sideOf(pack, ix, egoId, targetId, raw, canon) {
  const names = pack.sides;
  if (targetId === egoId || !canon.steps.length) return names.self;

  const head = canon.steps[0];
  if (head === "H" || head === "W") return names.affinal;
  if (head === "F") return names.paternal;
  if (head === "M") return names.maternal;

  const married = canon.steps.some((s) => s === "H" || s === "W");
  if (head === "S" || head === "D") return married ? names.affinal : names.direct;

  // The path opens on a sibling. A real sibling keeps you in your own branch;
  // a cousin that a pack folded into a sibling does not.
  const via = canon.nodes[1];
  const ownSibling = (ix.parentsOf.get(via) || []).some((p) => (ix.parentsOf.get(egoId) || []).includes(p));
  if (ownSibling) return married ? names.affinal : names.direct;
  const first = raw.steps[0];
  if (first === "F") return names.paternal;
  if (first === "M") return names.maternal;
  return names.direct;
}

export function resolve(pack, ix, egoId, targetId, paths) {
  const ego = ix.persons.get(egoId);
  const ctx = {
    egoId,
    egoSex: ego ? ego.sex : "M",
    target: targetId,
    half: halfSibling(ix, egoId, targetId),
    ix
  };
  const raws = paths.get(targetId) || [];
  const byKey = new Map();

  for (const raw of raws) {
    const canon = reduce(raw, pack.reduce);
    const lab = label(pack, ix, canon, ctx);
    const cand = {
      term: lab.t,
      tamil: lab.ta,
      verify: !!lab.verify,
      composed: !!lab.composed,
      note: lab.note,
      alt: lab.alt,
      unresolved: lab.unresolved,
      path: canon.steps.join(".") || "self",
      rawPath: raw.steps.join(".") || "self",
      via: canon.nodes,
      rawVia: raw.nodes,
      cost: score(raw, canon),
      side: sideOf(pack, ix, egoId, targetId, raw, canon)
    };
    const prev = byKey.get(lab.key);
    if (!prev || cand.cost < prev.cost) byKey.set(lab.key, cand);
  }

  const ranked = [...byKey.values()].sort((a, b) => a.cost - b.cost);
  if (!ranked.length) {
    return {
      term: "Not linked yet",
      path: "",
      side: "Unknown",
      candidates: [],
      via: [],
      rawVia: [],
      unreachable: true
    };
  }
  return { ...ranked[0], candidates: ranked, half: ctx.half };
}

export function resolveAll(pack, ix, egoId, maxLen = 6) {
  const paths = findPaths(ix, egoId, maxLen);
  const out = new Map();
  for (const id of ix.persons.keys()) out.set(id, resolve(pack, ix, egoId, id, paths));
  return out;
}
