// Tamil as a set of words you can load, rather than a naming system.
//
// The app names everybody in English and nothing else. A reader who wants
// their own vocabulary types it in, one person at a time, and that is the only
// naming mechanism there is. This file exists so a Tamil reader does not have
// to type twenty eight words by hand: it works out the Tamil term for each
// person and writes them in as if the reader had typed them.
//
// The Tamil rules in packs.js are still used here, and that matters for more
// than vocabulary. Tamil reduces a father's brother's son to a brother, so
// asking the Tamil rules gives "Annan" where a plain English reading would
// only ever reach "First cousin". The words that come out are therefore the
// Tamil words for the Tamil reading, even though the tree on screen is read
// the English way. The two disagree about shape, and the words win where they
// are asked for.
//
// What is deliberately not written:
//
//   - Anything the rules are unsure of. An override is plain text with no
//     flag on it, so writing a term marked `verify` would turn a word this
//     app is not confident about into something indistinguishable from the
//     reader's own, in their saved file, for good. Those are left in English
//     and counted, so the reader knows to look them up and decide.
//   - Composed fallbacks like "Father's sister's son", which are English
//     descriptions rather than Tamil words.
//   - A word for anybody the reader has already named. Their own word wins.
import { PACKS } from "./packs.js";
import { resolveAll } from "./kinship.js";

export const WORD_SETS = [
  { id: "tamil", pack: "tamil", label: "Tamil", script: "தமிழ்" }
];

// Works out one viewpoint's worth of words. Returns the words it would write
// and a count of everything it left alone, so the caller can say what
// happened rather than claiming it filled the family in.
export function wordsFor(tree, ix, egoId, setId, inScript) {
  const none = { words: {}, filled: 0, kept: 0, unsure: 0, far: 0 };
  // `find` rather than a lookup by key, so a crafted name like "__proto__"
  // matches nothing instead of reaching something inherited.
  const set = WORD_SETS.find((s) => s.id === setId);
  const pack = set && PACKS[set.pack];
  if (!pack) return none;
  // Paths are walked out from the viewpoint, and walking from somebody who is
  // not in the family throws rather than coming back empty.
  if (!ix.persons.has(egoId)) return none;

  const rel = resolveAll(pack, ix, egoId, 7);
  const words = {};
  let kept = 0;
  let unsure = 0;
  let far = 0;

  for (const id of ix.persons.keys()) {
    // Nobody needs a word for themselves.
    if (id === egoId) continue;
    const r = rel.get(id);
    if (!r || r.unreachable) { far++; continue; }
    if (r.verify || r.composed) { unsure++; continue; }
    const word = inScript ? r.tamil : r.term;
    if (!word) { unsure++; continue; }
    const key = egoId + ">" + id;
    if (tree.overrides[key]) { kept++; continue; }
    words[key] = word;
  }

  return { words, filled: Object.keys(words).length, kept, unsure, far };
}

// One new tree with the lot added, so a load is a single undoable change
// rather than one per person.
export function withWords(tree, words) {
  return { ...tree, overrides: { ...tree.overrides, ...words } };
}

// Everything this viewpoint has words for, so a load can be taken back.
export function clearWords(tree, egoId) {
  const overrides = {};
  const mine = egoId + ">";
  let cleared = 0;
  for (const key of Object.keys(tree.overrides)) {
    if (key.indexOf(mine) === 0) cleared++;
    else overrides[key] = tree.overrides[key];
  }
  return { tree: { ...tree, overrides }, cleared };
}
