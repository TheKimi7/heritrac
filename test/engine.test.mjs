// Node checks for everything that does not need a browser.
import { SAMPLE } from "../src/engine/data.js";
import { PACKS } from "../src/engine/packs.js";
import { buildIndex, resolveAll, ageOf, MAX_STEPS } from "../src/engine/kinship.js";
import { tidy, NODE_W } from "../src/engine/layout.js";
import * as M from "../src/engine/mutate.js";
import {
  normalise, emptyTree, serialise, readFamily, fingerprint, fileName,
  MAX_PEOPLE, MAX_BYTES
} from "../src/engine/file.js";
import { parseDate, formatDate, dateKey, yearsBetween } from "../src/engine/dates.js";
import { WORD_SETS, wordsFor, withWords, clearWords } from "../src/engine/wordset.js";

let pass = 0;
const fails = [];
const ok = (label, cond, extra) => {
  if (cond) { pass++; return; }
  fails.push(label + (extra === undefined ? "" : " :: " + extra));
};

// English is the only system the app reads a family in. The Tamil rules are
// still exercised below, because they are what the Tamil word set is built
// from, so a test asks for them by name.
const recordsFor = (tree, egoId, packId) =>
  resolveAll(PACKS[packId || "english"], buildIndex(tree), egoId, 7);

const termsFor = (tree, egoId, packId) => {
  const ix = buildIndex(tree);
  const rel = resolveAll(PACKS[packId || "english"], ix, egoId, 6);
  const out = new Map();
  for (const [id, r] of rel) out.set(id, r.term);
  return out;
};

/* ------------------------------------------------------------ the engine */

const sample = normalise(SAMPLE);
let t = termsFor(sample, "rajaraja");
ok("father", t.get("sundara") === "Father", t.get("sundara"));
ok("second cousin", t.get("gandaradittan") === "Second cousin", t.get("gandaradittan"));
ok("once removed", t.get("uttama") === "First cousin once removed", t.get("uttama"));
ok("great-uncle", t.get("gandaraditya") === "Great-uncle", t.get("gandaraditya"));
ok("great-grandfather", t.get("parantaka") === "Great-grandfather", t.get("parantaka"));
ok("in-law by marriage", t.get("vandiyadevan") === "Brother-in-law", t.get("vandiyadevan"));

// Two queens, so one of these four is a half brother and the other queen is
// a stepmother.
const fromRajadhiraja = termsFor(sample, "rajadhiraja");
ok("half brother", fromRajadhiraja.get("virarajendra") === "Half-brother", fromRajadhiraja.get("virarajendra"));
ok("stepmother", fromRajadhiraja.get("mukkokilan") === "Stepmother", fromRajadhiraja.get("mukkokilan"));
ok("brother-in-law beats cousin", fromRajadhiraja.get("narendra") === "Brother-in-law",
  fromRajadhiraja.get("narendra"));
const bothWays = resolveAll(PACKS.english, buildIndex(sample), "rajadhiraja", 7).get("narendra");
ok("and the cousin answer is kept as an alternative",
  (bothWays.candidates || []).some((c) => c.term === "First cousin"),
  (bothWays.candidates || []).map((c) => c.term).join(" | "));
ok("and the marriage beats the cousin for the couple themselves",
  termsFor(sample, "ammangadevi").get("narendra") === "Husband",
  termsFor(sample, "ammangadevi").get("narendra"));
ok("two greats are spelled out and capitalised once",
  termsFor(sample, "rajendra").get("parantaka") === "Great-great-grandfather",
  termsFor(sample, "rajendra").get("parantaka"));
ok("three or more greats take a multiplier",
  fromRajadhiraja.get("parantaka") === "3\u00d7 great-grandfather", fromRajadhiraja.get("parantaka"));
ok("and so do the collateral lines",
  termsFor(sample, "rajadhiraja").get("gandaraditya") === "3\u00d7 great-uncle",
  termsFor(sample, "rajadhiraja").get("gandaraditya"));

const ta = termsFor(sample, "rajaraja", "tamil");
ok("tamil father", ta.get("sundara") === "Appa", ta.get("sundara"));
ok("parallel cousin is a sibling", termsFor(sample, "sundara", "tamil").get("uttama") === "Annan",
  termsFor(sample, "sundara", "tamil").get("uttama"));
ok("cross cousin stays a cousin", termsFor(sample, "kulothunga", "tamil").get("madhurantaki") === "Muraipen",
  termsFor(sample, "kulothunga", "tamil").get("madhurantaki"));

// Every great-grandparent and great-grandchild must have a word of its own.
// F.M.F and M.M.F used to fall through and compose as "Paatti appa", and the
// descendant side showed up in the shipped sample as "Peran magal".
{
  const people = [{ id: "ego", name: "ego", sex: "M", birth: { year: 1990 } }];
  const unions = [];
  let un = 0;
  const add = (id, sex, year) => people.push({ id, name: id, sex, birth: { year } });
  const couple = (a, b, kids) => unions.push({ id: "u" + un++, spouses: [a, b], children: kids });
  add("F", "M", 1960); add("M", "F", 1962); couple("F", "M", ["ego"]);
  for (const g of [["F.F", "M"], ["F.M", "F"], ["M.F", "M"], ["M.M", "F"]]) add(g[0], g[1], 1935);
  couple("F.F", "F.M", ["F"]); couple("M.F", "M.M", ["M"]);
  for (const g of ["F.F", "F.M", "M.F", "M.M"]) {
    add(g + ".F", "M", 1910); add(g + ".M", "F", 1912);
    couple(g + ".F", g + ".M", [g]);
  }
  add("S", "M", 2015); add("D", "F", 2017); couple("ego", "W", [ "S", "D" ]);
  add("W", "F", 1991);
  for (const c of ["S", "D"]) {
    add(c + ".S", "M", 2040); add(c + ".D", "F", 2042);
    couple(c, c + ".x", [c + ".S", c + ".D"]);
    add(c + ".x", c === "S" ? "F" : "M", 2016);
  }
  for (const g of ["S.S", "S.D", "D.S", "D.D"]) {
    add(g + ".S", "M", 2065); add(g + ".D", "F", 2067);
    add(g + ".x", "F", 2066);
    couple(g, g + ".x", [g + ".S", g + ".D"]);
  }
  const deep = { format: "heritrac", version: 1, settings: { ego: "ego", pack: "tamil" }, people, unions };
  const rec = recordsFor(normalise(deep), "ego", "tamil");
  const ups = ["F.F.F", "F.M.F", "M.F.F", "M.M.F", "F.F.M", "F.M.M", "M.F.M", "M.M.M"];
  const downs = ["S.S.S", "S.D.S", "D.S.S", "D.D.S", "S.S.D", "S.D.D", "D.S.D", "D.D.D"];
  const bad = [...ups, ...downs].filter((id) => {
    const r = rec.get(id);
    return !r || r.composed || r.verify;
  });
  ok("all eight great-grandparents and great-grandchildren have a tamil word", bad.length === 0, bad.join(" "));
  ok("great-grandfather either way up", rec.get("F.M.F").term === "Kollu thatha", rec.get("F.M.F").term);
  ok("great-granddaughter through a daughter", rec.get("D.D.D").term === "Kollu pethi", rec.get("D.D.D").term);
  ok("and the regional variant is offered", rec.get("F.F.F").alt === "Poottan", rec.get("F.F.F").alt);
}

// The three in-law words that were flagged together: two are now sourced, the
// third is still a guess and has to stay amber.
{
  const people = [
    { id: "her", name: "her", sex: "F", birth: { year: 1990 } },
    { id: "him", name: "him", sex: "M", birth: { year: 1988 } },
    { id: "hisbro", name: "hisbro", sex: "M", birth: { year: 1992 } },
    { id: "hissis", name: "hissis", sex: "F", birth: { year: 1985 } },
    { id: "pa", name: "pa", sex: "M", birth: { year: 1960 } },
    { id: "ma", name: "ma", sex: "F", birth: { year: 1962 } },
    { id: "hersis", name: "hersis", sex: "F", birth: { year: 1994 } },
    { id: "herpa", name: "herpa", sex: "M", birth: { year: 1962 } },
    { id: "herma", name: "herma", sex: "F", birth: { year: 1964 } }
  ];
  const unions = [
    { id: "u0", spouses: ["her", "him"], children: [] },
    { id: "u1", spouses: ["pa", "ma"], children: ["him", "hisbro", "hissis"] },
    { id: "u2", spouses: ["herpa", "herma"], children: ["her", "hersis"] }
  ];
  const tree = { format: "heritrac", version: 1, settings: { ego: "her", pack: "tamil" }, people, unions };
  const hers = recordsFor(normalise(tree), "her", "tamil");
  const his = recordsFor(normalise(tree), "him", "tamil");
  ok("husband's sister is confirmed", hers.get("hissis").term === "Nathanar" && !hers.get("hissis").verify,
    hers.get("hissis").term + " verify=" + hers.get("hissis").verify);
  ok("husband's brother is confirmed", hers.get("hisbro").term === "Kozhunthanar" && !hers.get("hisbro").verify,
    hers.get("hisbro").term + " verify=" + hers.get("hisbro").verify);
  ok("wife's sister is still a guess", his.get("hersis").verify === true, his.get("hersis").term);
  ok("and says so", /Tirunelveli/.test(his.get("hersis").note || ""), his.get("hersis").note);
  ok("a woman's cross cousin word is still a guess",
    (PACKS.tamil.rules.filter((r) => r.ego === "F" && r.p === "M.B.S")[0] || {}).verify === true);
}

const fromNarendra = termsFor(sample, "narendra");
ok("view as somebody else", fromNarendra.get("rajadhiraja") === "Brother-in-law", fromNarendra.get("rajadhiraja"));
ok("their own father", fromNarendra.get("vimaladitya") === "Father", fromNarendra.get("vimaladitya"));

/* --------------------------------------------------------- the four adds */

let tree = emptyTree();
ok("empty tree has one person", tree.people.length === 1 && tree.settings.ego === "me");

let r = M.addParent(tree, "me", { name: "Dad", sex: "M", year: 1970 });
tree = r.tree;
ok("add parent", termsFor(tree, "me").get(r.id) === "Father");

r = M.addParent(tree, "me", { name: "Mum", sex: "F", year: 1972 });
tree = r.tree;
ok("second parent joins the same union", tree.unions.length === 1 && tree.unions[0].spouses.length === 2);
ok("add mother", termsFor(tree, "me").get(r.id) === "Mother");
ok("a third parent is refused", M.addParent(tree, "me", { name: "Nope", sex: "M" }).error !== undefined);

r = M.addSibling(tree, "me", { name: "Sis", sex: "F", year: 1999 });
tree = r.tree;
const sisId = r.id;
ok("add sibling", termsFor(tree, "me").get(sisId) === "Sister");
ok("sibling shares the parents", termsFor(tree, sisId).get("me") === "Sister");

r = M.addSpouse(tree, "me", { name: "Partner", sex: "M", year: 1998 });
tree = r.tree;
const spouseId = r.id;
ok("add spouse", termsFor(tree, "me").get(spouseId) === "Husband");

r = M.addChild(tree, "me", { name: "Kid", sex: "M", year: 2024 });
tree = r.tree;
ok("add child", termsFor(tree, "me").get(r.id) === "Son");
ok("the child belongs to the marriage", termsFor(tree, spouseId).get(r.id) === "Son");

// the other order: a child first, then the person they had it with
let late = emptyTree();
r = M.addChild(late, "me", { name: "Kid", sex: "F", year: 2020 });
late = r.tree;
const lateKid = r.id;
r = M.addSpouse(late, "me", { name: "Other", sex: "M", year: 1996 });
late = r.tree;
ok("a partner added after a child joins that family",
  termsFor(late, lateKid).get(r.id) === "Father", termsFor(late, lateKid).get(r.id));
ok("and is not recorded as a step-parent",
  late.unions.length === 1 && late.unions[0].spouses.length === 2, late.unions.length + " unions");
r = M.addSpouse(late, "me", { name: "Later", sex: "M", year: 1990 });
ok("a second partner does start a new family", r.tree.unions.length === 2);

/* ------------------------------------ a brother before anybody's parents */

let lone = emptyTree();
r = M.addSibling(lone, "me", { name: "Bro", sex: "M", year: 1990 });
lone = r.tree;
const broId = r.id;
ok("a sibling with no parents recorded still resolves",
  termsFor(lone, "me").get(broId) === "Brother", termsFor(lone, "me").get(broId));
ok("and resolves back the other way",
  termsFor(lone, broId).get("me") === "Sister", termsFor(lone, broId).get("me"));
// the check has to be able to fail: with the union gone they are strangers
const broken = normalise({ ...lone, unions: [] });
ok("the sibling check is not accidental",
  termsFor(broken, "me").get(broId) !== "Brother", termsFor(broken, "me").get(broId));
// parents added later adopt both children
r = M.addParent(lone, "me", { name: "Ma", sex: "F", year: 1960 });
lone = r.tree;
ok("a parent added later covers both children",
  termsFor(lone, broId).get(r.id) === "Mother", termsFor(lone, broId).get(r.id));

/* ------------------------------------------------- linking existing cards */

let two = emptyTree();
let a = M.addSpouse(two, "me", { name: "A", sex: "F" });
ok("spouse of a spouse is refused", M.canLink(a.tree, "spouse", "me", a.id) !== null);
ok("self link is refused", M.canLink(a.tree, "parent", "me", "me") !== null);
const cyc = M.addParent(emptyTree(), "me", { name: "P", sex: "M" });
ok("a loop is refused", M.canLink(cyc.tree, "parent", cyc.id, "me") !== null);
ok("a link that already exists is refused", M.canLink(cyc.tree, "child", cyc.id, "me") !== null);

// a card made on its own, then joined up afterwards
let loose = M.addPerson(emptyTree(), { name: "Nobody", sex: "F", year: 1995 });
ok("a card can be made with no links", loose.tree.people.length === 2);
ok("an unlinked card says so rather than guessing",
  /not linked/i.test(termsFor(loose.tree, "me").get(loose.id) || ""),
  termsFor(loose.tree, "me").get(loose.id));
const joined = M.link(loose.tree, "child", "me", loose.id);
ok("linking two cards is accepted", !joined.error, joined.error);
ok("and the word follows at once",
  termsFor(joined.tree, "me").get(loose.id) === "Daughter", termsFor(joined.tree, "me").get(loose.id));
const extra = M.addPerson(joined.tree, { name: "Z", sex: "M" });
const joined2 = M.link(extra.tree, "spouse", "me", extra.id);
ok("a second join is accepted too", !joined2.error, joined2.error);
ok("and it reads as a marriage",
  termsFor(joined2.tree, "me").get(extra.id) === "Husband", termsFor(joined2.tree, "me").get(extra.id));

/* ------------------------------------------------------- undoing a link */

let wrong = emptyTree();
r = M.addPerson(wrong, { name: "Stranger", sex: "F", year: 1990 });
wrong = r.tree;
const strangerId = r.id;
wrong = M.link(wrong, "spouse", "me", strangerId).tree;
ok("a wrong link reads straight away", termsFor(wrong, "me").get(strangerId) === "Wife",
  termsFor(wrong, "me").get(strangerId));
ok("the link is listed for undoing",
  M.linksOf(wrong, "me").some((l) => l.id === strangerId && l.how === "partner"),
  JSON.stringify(M.linksOf(wrong, "me")));
wrong = M.unlink(wrong, "me", strangerId).tree;
ok("unlinking puts it back", /not linked/i.test(termsFor(wrong, "me").get(strangerId) || ""),
  termsFor(wrong, "me").get(strangerId));
ok("and nobody is deleted", wrong.people.length === 2);

let sibs = M.addSibling(emptyTree(), "me", { name: "Bea", sex: "F" });
ok("brother and sister cannot be married to each other",
  M.canLink(sibs.tree, "spouse", "me", sibs.id) !== null,
  String(M.canLink(sibs.tree, "spouse", "me", sibs.id)));
let unsib = M.unlink(sibs.tree, "me", sibs.id).tree;
ok("a sibling link can be undone too",
  /not linked/i.test(termsFor(unsib, "me").get(sibs.id) || ""), termsFor(unsib, "me").get(sibs.id));

/* ----------------------------------------------------- editing a person */

let typo = emptyTree();
typo = M.updatePerson(typo, "me", { name: "Kim", sex: "M", year: 1998 });
ok("a name can be fixed", typo.people[0].name === "Kim");
ok("a sex can be fixed", typo.people[0].sex === "M");
ok("a birth year can be set", typo.people[0].birth.year === 1998);
r = M.addSibling(typo, "me", { name: "Sister", sex: "F", year: 2001 });
ok("and the words follow the correction",
  termsFor(r.tree, r.id).get("me") === "Annan" || termsFor(r.tree, r.id).get("me") === "Brother",
  termsFor(r.tree, r.id).get("me"));

/* --------------------------------------------- whole dates, or just years */

ok("a year on its own is a date", JSON.stringify(parseDate("1974")) === '{"year":1974}');
ok("a whole date is read day first",
  JSON.stringify(parseDate("05-11-1974")) === '{"year":1974,"month":11,"day":5}',
  JSON.stringify(parseDate("05-11-1974")));
ok("slashes and dots do too", !!parseDate("5/11/1974") && !!parseDate("5.11.1974"));
ok("what a date picker gives is read as well",
  JSON.stringify(parseDate("1974-11-05")) === '{"year":1974,"month":11,"day":5}');
ok("a day that does not exist is refused", parseDate("31-02-1974") === null);
ok("a month that does not exist is refused", parseDate("05-13-1974") === null);
ok("nonsense is refused", parseDate("not a date") === null && parseDate("") === null);
ok("a year comes back as a year", formatDate({ year: 1974 }) === "1974");
ok("a whole date comes back the way it went in", formatDate({ year: 1974, month: 11, day: 5 }) === "05-11-1974");
ok("dates sort by day inside a year",
  dateKey({ year: 2000, month: 1, day: 2 }) < dateKey({ year: 2000, month: 3, day: 1 }));
ok("an age counts the birthday, not the year",
  yearsBetween({ year: 2000, month: 12, day: 31 }, { year: 2026, month: 11, day: 19 }) === 25);

let dated = emptyTree();
dated = M.updatePerson(dated, "me", { name: "Me", sex: "F", born: "05-11-1974" });
ok("a whole date is kept on the person",
  dated.people[0].birth.day === 5 && dated.people[0].birth.month === 11 && dated.people[0].birth.year === 1974);
ok("and the age is worked out from it", ageOf(dated.people[0]) !== null);
dated = M.updatePerson(dated, "me", { born: "1974" });
ok("going back to a year alone drops the day", dated.people[0].birth.day === undefined);
r = M.addSibling(dated, "me", { name: "Twin", sex: "M", born: "1974" });
ok("two people born the same year with no days cannot be ranked",
  /or/.test(termsFor(r.tree, "me", "tamil").get(r.id) || ""), termsFor(r.tree, "me", "tamil").get(r.id));
let exact = M.updatePerson(M.updatePerson(r.tree, "me", { born: "05-11-1974" }), r.id, { born: "06-11-1974" });
ok("but whole dates settle it", termsFor(exact, "me", "tamil").get(r.id) === "Thambi",
  termsFor(exact, "me", "tamil").get(r.id));
const dateFile = serialise(exact);
ok("whole dates survive the file", JSON.parse(dateFile).people[0].birth.day === 5);

/* ------------------------------------------------------ pins and removal */

let pinned = M.setOverride(sample, "rajaraja", "narendra", "TESTPIN");
pinned = M.setOverride(pinned, "rajaraja", "rajendra2", "KEEP");
pinned = M.removePerson(pinned, "narendra");
ok("removing a person drops their pin", !pinned.overrides["rajaraja>narendra"]);
ok("and keeps everybody else's", pinned.overrides["rajaraja>rajendra2"] === "KEEP");
ok("the person is gone", !pinned.people.some((p) => p.id === "narendra"));
ok("and gone from every union",
  !pinned.unions.some((u) => u.spouses.includes("narendra") || u.children.includes("narendra")));

// "rajendra" is a prefix of "rajendra2", so an override key matched with
// includes() would be wiped by removing the wrong person.
let subs = M.setOverride(sample, "rajaraja", "rajendra2", "KEEPME");
subs = M.removePerson(subs, "rajendra");
ok("a shorter id is not treated as a substring", subs.overrides["rajaraja>rajendra2"] === "KEEPME",
  JSON.stringify(subs.overrides));

/* ----------------------------------------------------------- the layout */

const ix = buildIndex(sample);
const { at } = tidy(ix, "rajaraja");
ok("ego sits at the origin", Math.abs(at.get("rajaraja").x) < 0.5);
const rows = new Map();
for (const [id, p] of at) {
  if (!rows.has(p.y)) rows.set(p.y, []);
  rows.get(p.y).push([p.x, id]);
}
let overlaps = 0;
for (const list of rows.values()) {
  list.sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < list.length; i++) if (list[i][0] - list[i - 1][0] < NODE_W - 0.5) overlaps++;
}
ok("no two cards overlap", overlaps === 0, overlaps + " overlapping");
let apart = 0;
for (const u of ix.unions.values()) {
  const sp = (u.spouses || []).filter((s) => ix.persons.has(s));
  if (sp.length < 2) continue;
  if (Math.abs(at.get(sp[0]).x - at.get(sp[1]).x) > NODE_W + 40) apart++;
}
ok("every couple is side by side", apart === 0, apart + " apart");
let off = 0;
for (const u of ix.unions.values()) {
  const ch = (u.children || []).filter((c) => ix.persons.has(c));
  const sp = (u.spouses || []).filter((s) => ix.persons.has(s));
  if (!ch.length || !sp.length || sp.some((s) => ix.unionsOf.get(s).length > 1)) continue;
  // children who married into another family are drawn with that family
  if (ch.some((c) => ix.unionsOf.get(c).some((uid) => uid !== u.id && ix.unions.get(uid).spouses.includes(c)
    && ix.unions.get(uid).spouses.some((s) => s !== c && !ch.includes(s) && ix.parentsOf.get(s).length)))) continue;
  const xs = ch.map((c) => at.get(c).x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const par = sp.reduce((s, id) => s + at.get(id).x, 0) / sp.length;
  if (Math.abs(mid - par) > 60) { off++; fails.push("parents not over their children: " + u.id); }
}
ok("parents sit over their children", off === 0);

/* -------------------------------------------------------------- the file */

const text = serialise(sample);
const back = normalise(JSON.parse(text));
ok("a saved file reads back", back.people.length === sample.people.length);
ok("no terms are written to the file", !/"Father"|Brother-in-law/.test(text));
ok("an old file with persons still opens", normalise({ persons: [{ id: "x", name: "X", sex: "M" }] }).people.length === 1);

/* ------------------------------------------- files from somebody else */

// A family file is untrusted input: it arrives by upload or paste and nothing
// about it has been checked. Every case here used to be either a crash or a
// silent wrong answer.
{
  const good = {
    format: "heritrac", version: 1,
    meta: { name: "Theirs" },
    settings: { ego: "a", pack: "tamil" },
    people: [{ id: "a", name: "A", sex: "M", birth: { year: 1980 } },
             { id: "b", name: "B", sex: "F", birth: { year: 1982 } }],
    unions: [{ id: "u", spouses: ["a", "b"], children: [] }]
  };
  const evil = {
    "pack __proto__": { settings: { ego: "a", pack: "__proto__" } },
    "pack constructor": { settings: { ego: "a", pack: "constructor" } },
    "pack toString": { settings: { ego: "a", pack: "toString" } },
    "pack hasOwnProperty": { settings: { ego: "a", pack: "hasOwnProperty" } },
    "pack as object": { settings: { ego: "a", pack: { evil: 1 } } },
    "ego __proto__": { settings: { ego: "__proto__" } },
    "ego unknown": { settings: { ego: "nobody" } },
    "settings as array": { settings: [] },
    "name as object": { people: [{ id: "a", name: { toString: 1 }, sex: "M" }] },
    "name as array": { people: [{ id: "a", name: ["x"], sex: "M" }] },
    "id __proto__": { people: [{ id: "__proto__", name: "P", sex: "M" }] },
    "id constructor": { people: [{ id: "constructor", name: "C", sex: "M" }] },
    "union id __proto__": { unions: [{ id: "__proto__", spouses: ["a"], children: [] }] },
    "union id toString": { unions: [{ id: "toString", spouses: ["a", "b"], children: [] }] },
    "spouses as string": { unions: [{ id: "u", spouses: "a", children: "b" }] },
    "spouses of ghosts": { unions: [{ id: "u", spouses: ["ghost"], children: ["phantom"] }] },
    "meta name as object": { meta: { name: { a: 1 } } },
    "meta name all punctuation": { meta: { name: "???" } },
    "meta as array": { meta: [] },
    "people as object": { people: { a: 1 } },
    "sex as number": { people: [{ id: "a", name: "A", sex: 7 }] },
    "birth as string": { people: [{ id: "a", name: "A", sex: "M", birth: "1980" }] },
    "birth month 99": { people: [{ id: "a", name: "A", sex: "M", birth: { year: 1980, month: 99, day: 99 } }] },
    "birth year as object": { people: [{ id: "a", name: "A", sex: "M", birth: { year: { x: 1 } } }] },
    "duplicate ids": { people: [{ id: "a", name: "One", sex: "M" }, { id: "a", name: "Two", sex: "F" }] },
    "overrides __proto__": { overrides: { __proto__: "x", "a>b": "Word" } },
    "script in a name": { people: [{ id: "a", name: "<img src=x onerror=alert(1)>", sex: "M" }] },
    "nothing at all": {},
    "null": null,
    "an array": [],
    "a number": 7
  };
  let survived = 0;
  const broke = [];
  for (const [label, patch] of Object.entries(evil)) {
    const raw = patch && typeof patch === "object" && !Array.isArray(patch)
      ? JSON.parse(JSON.stringify({ ...good, ...patch }))
      : patch;
    try {
      // The whole pipeline a file goes through, end to end.
      const t = normalise(raw);
      const ix = buildIndex(t);
      if (t.settings.ego) resolveAll(PACKS.english, ix, t.settings.ego, 6);
      tidy(ix, t.settings.ego);
      JSON.parse(serialise(t));
      const fn = fileName(t);
      if (!/^[a-z0-9-]+\.json$/.test(fn)) throw new Error("bad filename " + fn);
      if ("pack" in t.settings) {
        throw new Error("a pack came back in settings: " + JSON.stringify(t.settings.pack));
      }
      survived++;
    } catch (e) {
      broke.push(label + " (" + e.message.slice(0, 60) + ")");
    }
  }
  ok("every crafted family file is survivable", broke.length === 0, broke.join(" | "));
  ok("and all of them were actually tried", survived === Object.keys(evil).length,
    survived + " of " + Object.keys(evil).length);

  // Naming systems are gone, so a file's pack is read past rather than
  // validated. These two used to guard a crash: an inherited property name
  // passed the old truthiness check because PACKS.__proto__ is truthy, and
  // the app then died on pack.rules. Nothing reads the field now, so what
  // matters is that neither a crafted value nor a real one comes back out.
  ok("an inherited key named as a pack is dropped",
    normalise({ ...good, settings: { ego: "a", pack: "__proto__" } }).settings.pack === undefined);
  ok("and so is a pack that used to be real",
    normalise(JSON.parse(JSON.stringify(good))).settings.pack === undefined);
  ok("a file written before the change still opens",
    normalise(JSON.parse(JSON.stringify(good))).people.length === good.people.length);
  ok("an id naming Object.prototype is refused",
    normalise({ ...good, people: [{ id: "__proto__", name: "P", sex: "M" }] }).people.length === 0);
  ok("a script tag in a name stays a plain string",
    typeof normalise({ ...good, people: [{ id: "a", name: "<script>x</script>", sex: "M" }] }).people[0].name === "string");
  ok("an unreadable name becomes empty rather than an object",
    normalise({ ...good, people: [{ id: "a", name: { x: 1 }, sex: "M" }] }).people[0].name === "");
  ok("a filename always ends up usable", fileName(normalise({ ...good, meta: { name: "???" } })) === "family.json");

  // Caps, so a huge paste cannot hang the tab.
  const many = { ...good, people: [], unions: [] };
  for (let i = 0; i < MAX_PEOPLE + 500; i++) many.people.push({ id: "p" + i, name: "P" + i, sex: "M" });
  ok("the people cap holds", normalise(many).people.length === MAX_PEOPLE, normalise(many).people.length);
  ok("an oversized paste is refused with a reason",
    /too big/.test(readFamily("{\"people\":[" + " ".repeat(MAX_BYTES) + "]}").error || ""));
  ok("junk is refused with a reason", /not valid JSON/.test(readFamily("not json").error || ""));
  ok("an empty family is refused", /nobody/.test(readFamily('{"people":[]}').error || ""));
  ok("a good family is accepted", !!readFamily(JSON.stringify(good)).tree);
  ok("and unreadable entries are counted",
    readFamily(JSON.stringify({ ...good, people: [...good.people, { id: "__proto__", name: "x" }] })).dropped === 1);

  // normalise runs on live trees too, when the viewpoint or the pack changes,
  // so it has to be lossless for anything the app itself produces.
  const twice = normalise(normalise(SAMPLE));
  ok("normalise is lossless on the sample",
    fingerprint(twice) === fingerprint(normalise(SAMPLE)) && twice.people.length === 28,
    twice.people.length + " people");
}

/* ----------------------------------------- what counts as unsaved work */

{
  const a = normalise(SAMPLE);
  const b = normalise({ ...a, settings: { ego: "rajendra", pack: "tamil" } });
  ok("changing viewpoint and pack is not unsaved work", fingerprint(a) === fingerprint(b));
  const c = M.updatePerson(a, "rajaraja", { name: "Someone Else" });
  ok("editing a person is", fingerprint(a) !== fingerprint(c));
  // Not addParent on Rajaraja: he already has two, so the app rightly
  // refuses and the tree is unchanged, which would pass this for the wrong
  // reason. A child can always be added.
  const added = M.addChild(a, "rajaraja", { name: "New", sex: "M", year: 2010 });
  ok("the add actually happened", !added.error && added.tree.people.length === 29,
    added.error || added.tree.people.length);
  ok("and so is adding somebody", fingerprint(a) !== fingerprint(added.tree));
  ok("a refused add changes nothing",
    fingerprint(a) === fingerprint(M.addParent(a, "rajaraja", { name: "No", sex: "M" }).tree));
}

/* -------------------------------------------------------- how far it goes */
{
  // A founding couple whose line branches for six generations, with ego a
  // leaf on one side: his furthest cousins are about twelve steps away, up to
  // the shared ancestor and back down. This is the shape a large family makes
  // and the one the old limit of seven could not name.
  const people = [{ id: "a0", name: "Root", sex: "M", birth: { year: 1700 } }];
  const unions = [];
  let frontier = ["a0"], n = 1, u = 0;
  for (let g = 0; g < 6; g++) {
    const next = [];
    for (const p of frontier) {
      const sp = "s" + n;
      people.push({ id: sp, name: "S" + n, sex: "F", birth: { year: 1700 + g * 25 } });
      n++;
      const kids = [];
      for (let k = 0; k < 2; k++) {
        const id = "p" + n;
        people.push({ id, name: "P" + n, sex: k % 2 ? "F" : "M", birth: { year: 1725 + g * 25 } });
        n++; kids.push(id); next.push(id);
      }
      unions.push({ id: "u" + (u++), spouses: [p, sp], children: kids });
    }
    frontier = next;
  }
  const clan = normalise({ settings: { ego: frontier[0] }, people, unions });
  const cix = buildIndex(clan);
  const me = clan.settings.ego;
  const lost = (len) => {
    let far = 0;
    for (const [, r] of resolveAll(PACKS.english, cix, me, len)) if (r.unreachable) far++;
    return far;
  };

  ok("the test clan is a big one", clan.people.length > 150, clan.people.length);
  ok("seven steps could not name most of it", lost(7) > clan.people.length / 2, lost(7));
  ok("and the engine's own reach names all of it", lost(MAX_STEPS) === 0, lost(MAX_STEPS));
  ok("which is what the app asks for", MAX_STEPS >= 24, MAX_STEPS);
}

/* ------------------------------------------------- loading a set of words */
{
  const t0 = normalise(SAMPLE);
  const ix0 = buildIndex(t0);
  const got = wordsFor(t0, ix0, "rajaraja", "tamil", false);
  const after = withWords(t0, got.words);
  const word = (tree, id) => tree.overrides["rajaraja>" + id];
  const english = termsFor(t0, "rajaraja");

  ok("there is a Tamil word set", WORD_SETS.some((w) => w.id === "tamil"));
  ok("loading it names most of the family", got.filled > 20, got.filled);
  ok("and writes them under this viewpoint",
    Object.keys(got.words).every((k) => k.indexOf("rajaraja>") === 0));

  // The point of asking the Tamil rules rather than translating the English
  // ones: Tamil reduces these two to a brother and to a father's elder
  // brother, so the words are not the words an English reading could reach.
  ok("a second cousin in English is a brother in Tamil",
    word(after, "gandaradittan") === "Annan" && english.get("gandaradittan") === "Second cousin",
    word(after, "gandaradittan") + " / " + english.get("gandaradittan"));
  ok("and a first cousin once removed is Periyappa",
    word(after, "uttama") === "Periyappa" && english.get("uttama") === "First cousin once removed",
    word(after, "uttama"));
  ok("the plain ones come through too", word(after, "sundara") === "Appa", word(after, "sundara"));

  // The one that matters most. An override is plain text with no flag on it,
  // so a word the rules are unsure of would become indistinguishable from the
  // reader's own once it was in their file.
  const unsureIds = ["rajaditya", "gandaraditya", "sembiyan"];
  ok("a word the rules are unsure of is never written",
    unsureIds.every((id) => word(after, id) === undefined),
    unsureIds.filter((id) => word(after, id)).join(", "));
  ok("those people keep their English word",
    unsureIds.every((id) => english.get(id) && english.get(id).indexOf("Great-") === 0));
  ok("and they are counted, not hidden", got.unsure === unsureIds.length, got.unsure);
  ok("nobody is named with an empty string",
    Object.values(got.words).every((w) => typeof w === "string" && w.trim().length > 0));
  ok("the reader is never named", word(after, "rajaraja") === undefined);

  // A reader's own word outranks the set, every time.
  const mine = M.setOverride(t0, "rajaraja", "sundara", "Appaji");
  const second = wordsFor(mine, buildIndex(mine), "rajaraja", "tamil", false);
  ok("a word you typed yourself is kept", second.words["rajaraja>sundara"] === undefined);
  ok("and it is reported as kept", second.kept === 1, second.kept);
  ok("the rest are still offered", second.filled === got.filled - 1, second.filled);
  ok("loading twice changes nothing the second time",
    wordsFor(after, buildIndex(after), "rajaraja", "tamil", false).filled === 0);

  // The script variant writes Tamil, not transliteration.
  const inTa = wordsFor(t0, ix0, "tamil", "tamil", true);
  const script = wordsFor(t0, ix0, "rajaraja", "tamil", true);
  ok("the script variant writes Tamil letters",
    /[\u0b80-\u0bff]/.test(script.words["rajaraja>sundara"] || ""), script.words["rajaraja>sundara"]);
  ok("and still skips the unsure ones",
    unsureIds.every((id) => script.words["rajaraja>" + id] === undefined));
  ok("an unknown viewpoint names nobody", inTa.filled === 0, inTa.filled);
  ok("an unknown word set names nobody", wordsFor(t0, ix0, "rajaraja", "klingon", false).filled === 0);
  ok("an inherited name as a word set names nobody",
    wordsFor(t0, ix0, "rajaraja", "__proto__", false).filled === 0);

  // Words belong to the viewpoint that was loaded, and only that one.
  const both = withWords(after, wordsFor(after, buildIndex(after), "kundavai", "tamil", false).words);
  ok("another viewpoint gets its own words", both.overrides["kundavai>sundara"] === "Appa");
  const cleared = clearWords(both, "rajaraja");
  ok("clearing one viewpoint leaves the other", cleared.tree.overrides["kundavai>sundara"] === "Appa");
  ok("and takes that one away", cleared.tree.overrides["rajaraja>sundara"] === undefined);
  ok("clearing reports how many went", cleared.cleared === got.filled, cleared.cleared);
  ok("clearing nothing is not an error", clearWords(t0, "rajaraja").cleared === 0);

  // Loaded words are ordinary words: they save, reopen and count as a change.
  const round = normalise(JSON.parse(serialise(after)));
  ok("loaded words survive a save and reopen",
    round.overrides["rajaraja>gandaradittan"] === "Annan", round.overrides["rajaraja>gandaradittan"]);
  ok("loading words is a change worth saving", fingerprint(after) !== fingerprint(t0));
  ok("a loaded word wins over the worked out one",
    termsFor(after, "rajaraja").get("gandaradittan") === "Second cousin",
    "the engine still reads English underneath");
}

console.log(fails.length ? "FAILED " + fails.length + " of " + (pass + fails.length) : "all " + pass + " engine checks pass");
for (const f of fails) console.log("  FAIL " + f);
process.exit(fails.length ? 1 : 0);
