// A tidy family walk. A couple and everyone descended from them are laid out
// as one block, each block takes exactly the width it needs, and sibling
// blocks sit side by side. Parents land centred over their children by
// construction, and because no two blocks share horizontal space, nobody can
// collide with anybody. It runs once per structural change: there is no
// physics, no animation and nothing to settle.

import { dateKey } from "./dates.js";

export const ROW = 210;
export const NODE_W = 212;
// The union knot, which is a dot rather than a card. Declared here because
// both its position and the dimensions handed to React Flow depend on it.
export const KNOT = 10;
// Room for a name on two lines. Names are wrapped rather than cut short, and
// a card keeps the same size whatever is in it: React Flow is told these
// dimensions instead of measuring the card, and a card whose real height did
// not match what it was told would put its handles in the wrong place.
export const NODE_H = 86;
export const SIB_GAP = 64;
export const SPOUSE_GAP = 26;

const PITCH = NODE_W + SPOUSE_GAP;

export function tidy(ix, egoId) {
  const at = new Map();
  const placed = new Set();

  const birth = (id) => {
    const p = ix.persons.get(id);
    return p ? dateKey(p.birth) : null;
  };
  const byBirth = (a, b) => {
    const ya = birth(a);
    const yb = birth(b);
    if (typeof ya === "number" && typeof yb === "number") return ya - yb;
    return 0;
  };
  const ownUnions = (id) => (ix.unionsOf.get(id) || [])
    .filter((uid) => ((ix.unions.get(uid) || {}).spouses || []).includes(id));

  // Anybody on their own island is drawn on the same row as the person you
  // are viewing as, so a card you have just made does not claim to be a
  // generation above or below anyone.
  const home = ix.component ? ix.component.get(egoId) : undefined;
  const egoGen = ix.generation.get(egoId) || 0;
  const levelOf = (id) => {
    const g = ix.generation.get(id) || 0;
    if (home === undefined || !ix.component) return g;
    return ix.component.get(id) === home ? g : g + egoGen;
  };

  for (const id of ix.persons.keys()) {
    at.set(id, { x: 0, y: -levelOf(id) * ROW });
  }

  function block(id) {
    if (placed.has(id) || !ix.persons.has(id)) return null;
    placed.add(id);
    const members = [];
    const groups = [];
    const own = ownUnions(id);
    const partners = own.map((uid) =>
      (ix.unions.get(uid).spouses || []).filter((s) => s !== id && ix.persons.has(s) && !placed.has(s)));
    for (const list of partners) for (const s of list) placed.add(s);

    // Someone who married more than once sits between the people they
    // married, so neither family is stranded across the row.
    if (own.length > 1 && partners[0].length) members.push(...partners[0]);
    const self = members.length;
    members.push(id);

    own.forEach((uid, i) => {
      if (!(own.length > 1 && i === 0)) members.push(...partners[i]);
      const kids = (ix.unions.get(uid).children || [])
        .filter((c) => ix.persons.has(c))
        .sort(byBirth)
        .map((c) => block(c))
        .filter(Boolean);
      groups.push({ uid, kids });
    });

    // Children of a union nobody is married into still have to hang together.
    for (const uid of (ix.unionsOf.get(id) || [])) {
      const u = ix.unions.get(uid);
      if (!u || (u.spouses || []).filter((s) => ix.persons.has(s)).length) continue;
      for (const c of (u.children || []).filter((x) => ix.persons.has(x)).sort(byBirth)) {
        const sib = block(c);
        if (sib) groups.push({ uid, kids: [sib], aside: true });
      }
    }

    return { anchor: id, members, groups, self };
  }

  function shift(b, dx) {
    for (const id of b.members) at.get(id).x += dx;
    for (const g of b.groups) for (const k of g.kids) shift(k, dx);
  }

  // Lays the block out with its left edge at `left` and reports the space it
  // actually took, which is what the caller spaces the next one by.
  function assign(b, left) {
    let cursor = left;
    let lo = Infinity;
    let hi = -Infinity;
    const mids = [];
    const asides = [];

    for (const g of b.groups) {
      if (!g.kids.length) { if (!g.aside) mids.push(null); continue; }
      let c = cursor;
      for (const k of g.kids) {
        const e = assign(k, c);
        lo = Math.min(lo, e.left);
        hi = Math.max(hi, e.right);
        c = e.right + SIB_GAP;
      }
      cursor = c;
      const first = at.get(g.kids[0].anchor).x;
      const last = at.get(g.kids[g.kids.length - 1].anchor).x;
      // Centred over the first and last child themselves, not over the width
      // of everyone descended from them.
      (g.aside ? asides : mids).push((first + last) / 2);
    }

    const live = mids.filter((m) => m !== null);
    const xs = new Array(b.members.length).fill(0);
    if (!live.length) {
      b.members.forEach((_, i) => { xs[i] = left + NODE_W / 2 + i * PITCH; });
    } else {
      // With two marriages both families cannot sit directly underneath, so
      // the people who married each other stay side by side and the links to
      // the two sets of children do the leaning.
      const centre = live.reduce((a, c) => a + c, 0) / live.length;
      const start = centre - b.members.length * PITCH / 2 + PITCH / 2;
      b.members.forEach((_, i) => { xs[i] = start + i * PITCH; });
    }

    b.members.forEach((id, i) => {
      at.get(id).x = xs[i];
      lo = Math.min(lo, xs[i] - NODE_W / 2);
      hi = Math.max(hi, xs[i] + NODE_W / 2);
    });

    // Centring the parents can reach back past where the block was meant to
    // start. Slide the whole block right rather than let it run into the
    // family beside it.
    if (lo < left - 0.5) {
      const dx = left - lo;
      shift(b, dx);
      lo += dx;
      hi += dx;
    }
    return { left: lo, right: hi };
  }

  const roots = [...ix.persons.keys()]
    .filter((id) => (ix.parentsOf.get(id) || []).length === 0)
    .sort((a, b) => levelOf(b) - levelOf(a) || byBirth(a, b));

  const tops = [];
  for (const id of roots) { const b = block(id); if (b) tops.push(b); }
  for (const id of ix.persons.keys()) { const b = block(id); if (b) tops.push(b); }

  let cursor = 0;
  for (const b of tops) cursor = assign(b, cursor).right + SIB_GAP * 2;

  const ego = at.get(egoId);
  const slide = ego ? -ego.x : 0;
  if (slide) for (const p of at.values()) p.x += slide;

  // Where each union's knot sits: between the couple, or over the children
  // when nobody is married into it.
  const knots = new Map();
  for (const u of ix.unions.values()) {
    const sp = (u.spouses || []).filter((s) => ix.persons.has(s));
    const ch = (u.children || []).filter((c) => ix.persons.has(c));
    const from = sp.length ? sp : ch;
    if (!from.length) continue;
    const x = from.reduce((a, id) => a + at.get(id).x, 0) / from.length;
    // Between the two cards when there is a couple, so the line that marries
    // them is horizontal and the line down to the children leaves from it.
    const y = sp.length
      ? from.reduce((a, id) => a + at.get(id).y, 0) / from.length
      : Math.min(...ch.map((c) => at.get(c).y)) - ROW / 2;
    knots.set(u.id, { x, y });
  }

  return { at, knots };
}

export function rowsOf(ix) {
  const rows = new Map();
  for (const [id, g] of ix.generation) {
    if (!ix.persons.has(id)) continue;
    if (!rows.has(g)) rows.set(g, []);
    rows.get(g).push(id);
  }
  return rows;
}
