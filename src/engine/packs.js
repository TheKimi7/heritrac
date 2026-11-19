// packs.js
// A kinship system is two things: how paths collapse, and what the collapsed
// paths are called. Both live in a pack, so adding a language or a regional
// variant means adding a file here, not touching the engine.
//
// Path notation: F father, M mother, B brother, Z sister, S son, D daughter,
// H husband, W wife, read left to right from the viewer. F.Z.S is father's
// sister's son.
//
// A rule may carry:
//   age   [a, b]  compare the person at path position a with the one at b,
//                 position 0 being the viewer, and pick elder or younger
//   half          the word to use when a sibling shares only one parent
//   when  fn      a condition, given { ix, egoId, target }
//   ego   "M"|"F" the rule only applies to a viewer of that sex
//   verify        the term is a best guess and should be checked
//   alt           another word the same position goes by
//   note          something worth telling the reader

const UPS = { F: 1, M: 1 };
const DOWNS = { S: 1, D: 1 };

// Rewrites shared by every system: these are facts about the graph rather
// than about any language. A parent's child is a sibling; a child's other
// parent is a partner; a sibling's sibling is a sibling.
const STRUCTURAL = [
  [["F", "S"], ["B"]], [["F", "D"], ["Z"]], [["M", "S"], ["B"]], [["M", "D"], ["Z"]],
  [["S", "F"], ["H"]], [["S", "M"], ["W"]], [["D", "F"], ["H"]], [["D", "M"], ["W"]],
  [["B", "B"], ["B"]], [["B", "Z"], ["Z"]], [["Z", "B"], ["B"]], [["Z", "Z"], ["Z"]]
];

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
const REMOVES = ["", "once removed", "twice removed", "three times removed", "four times removed"];

function ordinal(n) {
  return ORDINALS[n - 1] || n + "th";
}
function removed(n) {
  if (n === 0) return "";
  return REMOVES[n] || n + " times removed";
}
function greats(n, word) {
  if (n <= 0) return word;
  // Genealogical convention: two is the most anybody stacks, and past that the
  // count goes in front, so "4x great-grandfather" rather than a row of greats
  // nobody can count by eye. Below the switch only the first is capitalised:
  // great-great-grandfather, not Great-Great-grandfather.
  if (n >= 3) return n + "\u00d7 great-" + word.toLowerCase();
  return "Great-" + "great-".repeat(n - 1) + word.toLowerCase();
}
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Splits a reduced path into "up this many, across a sibling or not, down this
// many". Everything English calls an uncle, a nephew or a cousin is some
// combination of those three numbers.
function shape(steps) {
  let i = 0;
  let up = 0;
  while (i < steps.length && UPS[steps[i]]) { up++; i++; }
  let across = null;
  if (i < steps.length && (steps[i] === "B" || steps[i] === "Z")) { across = steps[i]; i++; }
  let down = 0;
  while (i < steps.length && DOWNS[steps[i]]) { down++; i++; }
  if (i !== steps.length) return null;
  return { up, across, down };
}

const english = {
  id: "english",
  label: "English",
  blurb:
    "Both sides of the family share one set of words. Cousins are counted by degree and removal, " +
    "so the app works out “second cousin once removed” for you.",
  sides: {
    paternal: "Father's side",
    maternal: "Mother's side",
    affinal: "Married in",
    direct: "Direct line",
    self: "You"
  },
  joiner: "'s ",
  reduce: STRUCTURAL,
  basics: {
    F: "father", M: "mother", S: "son", D: "daughter",
    H: "husband", W: "wife", B: "brother", Z: "sister"
  },
  rules: [
    { p: "", t: "You" },
    { p: "F", t: "Father" },
    { p: "M", t: "Mother" },
    { p: "B", t: "Brother", half: "Half-brother" },
    { p: "Z", t: "Sister", half: "Half-sister" },
    { p: "S", t: "Son" },
    { p: "D", t: "Daughter" },
    { p: "H", t: "Husband" },
    { p: "W", t: "Wife" },

    {
      p: "F.W", t: "Stepmother",
      when: (c) => !c.ix.parentsOf.get(c.egoId).includes(c.target),
      note: "Married to your father, and not one of your parents."
    },
    {
      p: "M.H", t: "Stepfather",
      when: (c) => !c.ix.parentsOf.get(c.egoId).includes(c.target)
    },

    { p: "F.B", t: "Uncle" }, { p: "M.B", t: "Uncle" },
    { p: "F.Z", t: "Aunt" }, { p: "M.Z", t: "Aunt" },
    { p: "F.B.W", t: "Aunt", note: "By marriage." },
    { p: "M.B.W", t: "Aunt", note: "By marriage." },
    { p: "F.Z.H", t: "Uncle", note: "By marriage." },
    { p: "M.Z.H", t: "Uncle", note: "By marriage." },

    { p: "Z.H", t: "Brother-in-law" }, { p: "B.W", t: "Sister-in-law" },
    { p: "W.B", t: "Brother-in-law" }, { p: "H.B", t: "Brother-in-law" },
    { p: "W.Z", t: "Sister-in-law" }, { p: "H.Z", t: "Sister-in-law" },
    { p: "W.F", t: "Father-in-law" }, { p: "H.F", t: "Father-in-law" },
    { p: "W.M", t: "Mother-in-law" }, { p: "H.M", t: "Mother-in-law" },
    { p: "S.W", t: "Daughter-in-law" }, { p: "D.H", t: "Son-in-law" }
  ],
  // Everything regular is computed rather than listed: grandparents,
  // grandchildren, uncles and aunts at any height, nephews and nieces at any
  // depth, and the whole cousin grid.
  fallback(c) {
    const last = c.ix.persons.get(c.nodes[c.nodes.length - 1]);
    const male = !last || last.sex !== "F";
    const tail = c.steps[c.steps.length - 1];

    // The husband of your grandfather's sister is a great-uncle, not a
    // four-word description.
    if (tail === "H" || tail === "W") {
      const head = shape(c.steps.slice(0, -1));
      if (head && head.across && head.down === 0 && head.up >= 1) {
        return { t: greats(head.up - 1, male ? "Uncle" : "Aunt"), note: "By marriage." };
      }
    }

    const sh = shape(c.steps);
    if (!sh) return null;

    if (!sh.across && sh.down === 0 && sh.up >= 2) {
      return { t: greats(sh.up - 2, male ? "Grandfather" : "Grandmother") };
    }
    if (!sh.across && sh.up === 0 && sh.down >= 2) {
      return { t: greats(sh.down - 2, male ? "Grandson" : "Granddaughter") };
    }
    if (sh.across && sh.down === 0 && sh.up >= 1) {
      return { t: greats(sh.up - 1, male ? "Uncle" : "Aunt") };
    }
    if (sh.across && sh.up === 0 && sh.down >= 1) {
      return { t: greats(sh.down - 1, male ? "Nephew" : "Niece") };
    }
    if (sh.across && sh.up >= 1 && sh.down >= 1) {
      const degree = Math.min(sh.up, sh.down);
      const away = removed(Math.abs(sh.up - sh.down));
      return {
        t: cap(ordinal(degree)) + " cousin" + (away ? " " + away : ""),
        note: degree === 1 && !away ? "You share a set of grandparents." : undefined
      };
    }
    return null;
  }
};

// Tamil is a Dravidian system: it splits the family by crossness rather than
// by distance. A father's brother's child is not a cousin, it is a sibling,
// and a mother's brother is the same position as a father-in-law.
const T = (t, ta) => ({ t, ta });

const tamil = {
  id: "tamil",
  label: "Tamil",
  script: "Tamil",
  blurb:
    "Parallel cousins are siblings and cross cousins are not, elder and younger are separate words, " +
    "and a mother's brother shares a word with a father-in-law.",
  sides: {
    paternal: "Father's side",
    maternal: "Mother's side",
    affinal: "Married in",
    direct: "Direct line",
    self: "You"
  },
  joiner: " ",
  reduce: STRUCTURAL.concat([
    [["F", "B", "S"], ["B"]], [["F", "B", "D"], ["Z"]],
    [["M", "Z", "S"], ["B"]], [["M", "Z", "D"], ["Z"]]
  ]),
  basics: {
    F: T("appa", "அப்பா"),
    M: T("amma", "அம்மா"),
    S: T("magan", "மகன்"),
    D: T("magal", "மகள்"),
    H: T("kanavar", "கணவர்"),
    W: T("manaivi", "மனைவி"),
    B: { elder: T("annan", "அண்ணன்"), younger: T("thambi", "தம்பி"), age: true },
    Z: { elder: T("akka", "அக்கா"), younger: T("thangai", "தங்கை"), age: true }
  },
  rules: [
    { p: "", ...T("You", "நான்") },
    { p: "F", ...T("Appa", "அப்பா") },
    { p: "M", ...T("Amma", "அம்மா") },
    { p: "B", age: [1, 0], elder: T("Annan", "அண்ணன்"), younger: T("Thambi", "தம்பி") },
    { p: "Z", age: [1, 0], elder: T("Akka", "அக்கா"), younger: T("Thangai", "தங்கை") },
    { p: "S", ...T("Magan", "மகன்") },
    { p: "D", ...T("Magal", "மகள்") },
    { p: "H", ...T("Kanavar", "கணவர்") },
    { p: "W", ...T("Manaivi", "மனைவி") },

    { p: "F.F", ...T("Thatha", "தாத்தா") },
    { p: "M.F", ...T("Thatha", "தாத்தா") },
    { p: "F.M", ...T("Paatti", "பாட்டி") },
    { p: "M.M", ...T("Paatti", "பாட்டி") },

    {
      p: "F.B", age: [2, 1],
      elder: T("Periyappa", "பெரியப்பா"),
      younger: T("Chithappa", "சித்தப்பா"),
      note: "Ranked against your father's age, not yours."
    },
    {
      p: "F.B.W", age: [2, 1],
      elder: T("Periyamma", "பெரியம்மா"),
      younger: T("Chithi", "சித்தி"),
      note: "She takes the rank of the brother she married."
    },
    {
      p: "M.Z", age: [2, 1],
      elder: T("Periyamma", "பெரியம்மா"),
      younger: T("Chithi", "சித்தி"),
      note: "Ranked against your mother's age."
    },
    {
      p: "M.Z.H", age: [2, 1],
      elder: T("Periyappa", "பெரியப்பா"),
      younger: T("Chithappa", "சித்தப்பா")
    },

    { p: "F.Z", ...T("Attai", "அத்தை") },
    { p: "M.B", ...T("Maaman", "மாமன்"), note: "The same word as a wife's father." },
    { p: "M.B.W", ...T("Maami", "மாமி") },
    {
      p: "F.Z.H", ...T("Maaman", "மாமன்"),
      note: "Your aunt's husband is a maaman: under the cross-cousin rule he holds the same position as your mother's brother."
    },

    { p: "M.B.S", ego: "M", ...T("Maccaan", "மச்சான்"), alt: "Muraimaaman" },
    { p: "F.Z.S", ego: "M", ...T("Maccaan", "மச்சான்"), alt: "Muraimaaman" },
    { p: "M.B.D", ego: "M", ...T("Muraipen", "முறைப்பெண்"), alt: "Maaman magal" },
    { p: "F.Z.D", ego: "M", ...T("Muraipen", "முறைப்பெண்"), alt: "Attai magal" },
    // These four are the weakest rules in the pack and stay flagged. The
    // anthropology is clear that the cross-cousin words shift with the
    // viewer's sex, but no source found states what a woman calls her own
    // cross-cousins, and Maccini below is a man's word for his wife's sister,
    // so reusing it for a female viewer may well be wrong.
    {
      p: "M.B.S", ego: "F", ...T("Muraimaaman", "முறைமாமன்"), verify: true,
      note: "A woman's word for a male cross cousin varies by family. Type your own if this is not yours."
    },
    {
      p: "F.Z.S", ego: "F", ...T("Muraimaaman", "முறைமாமன்"), verify: true,
      note: "A woman's word for a male cross cousin varies by family. Type your own if this is not yours."
    },
    { p: "M.B.D", ego: "F", ...T("Maccini", "மச்சினி"), verify: true },
    { p: "F.Z.D", ego: "F", ...T("Maccini", "மச்சினி"), verify: true },

    {
      p: "Z.H", age: [1, 0],
      elder: T("Athimber", "அத்திம்பேர்"),
      younger: T("Maccaan", "மச்சான்")
    },
    {
      p: "B.W", age: [1, 0],
      elder: T("Annani", "அண்ணி"),
      younger: { t: "Thambi manaivi", ta: "தம்பி மனைவி", v: true }
    },
    { p: "W.B", ...T("Maccaan", "மச்சான்") },
    // Still a guess. The dictionaries make கொழுந்தி the feminine of
    // கொழுந்தன் and gloss it "wife's sister" (devistudios.in), but the
    // Tirunelveli entry glosses the same word as the husband's younger
    // sister, and no source found explains the split. Left flagged.
    {
      p: "W.Z", ...T("Kozhundhiyal", "கொழுந்தியாள்"), alt: "Kozhunthi", verify: true,
      note: "In Tirunelveli the same word is used for a husband's younger sister. Maccini is the other word for this position."
    },
    // கொழுந்தன் is "husband's younger brother" in the University of Madras
    // Tamil Lexicon and in Winslow, which marks it informal; கொழுந்தனார் is
    // the respectful form, and a Nagarathar glossary gives it for the
    // husband's brother without qualifying the age. No corroborated separate
    // word for the elder was found, so this stands for both.
    {
      p: "H.B", ...T("Kozhunthanar", "கொழுந்தனார்"),
      note: "Strictly the husband's younger brother in the dictionaries, though it is used for either."
    },
    // Confirmed: glossed "husband's sister" by every source found, and only a
    // woman has one, which the path already guarantees.
    { p: "H.Z", ...T("Nathanar", "நாத்தனார்") },
    { p: "W.F", ...T("Maaman", "மாமன்") },
    { p: "H.F", ...T("Maaman", "மாமன்") },
    { p: "W.M", ...T("Maami", "மாமி") },
    { p: "H.M", ...T("Maami", "மாமி") },

    { p: "S.W", ...T("Marumagal", "மருமகள்") },
    { p: "D.H", ...T("Marumagan", "மருமகன்") },
    {
      p: "Z.S", ego: "M", ...T("Marumagan", "மருமகன்"),
      note: "A sister's son and a daughter's husband share one word, again because of the marriage rule."
    },
    { p: "Z.D", ego: "M", ...T("Marumagal", "மருமகள்") },

    { p: "S.S", ...T("Peran", "பேரன்") },
    { p: "D.S", ...T("Peran", "பேரன்") },
    { p: "S.D", ...T("Pethi", "பேத்தி") },
    { p: "D.D", ...T("Pethi", "பேத்தி") },

    // The descendant side of the same gap. கொள்ளுப்பேரன் is glossed
    // "great-grandson, a grandson's son" in the Tamil lexicon (mandhiram.com)
    // and கொள்ளுப்பேத்தி "a grandson's daughter" in the Tamil-English
    // dictionary (glosbe.com). The study of the Nadars records SSS as
    // Kolluperan, so the கொள்ளு- prefix runs in both directions.
    { p: "S.S.S", ...T("Kollu peran", "கொள்ளுப்பேரன்") },
    { p: "S.D.S", ...T("Kollu peran", "கொள்ளுப்பேரன்") },
    { p: "D.S.S", ...T("Kollu peran", "கொள்ளுப்பேரன்") },
    { p: "D.D.S", ...T("Kollu peran", "கொள்ளுப்பேரன்") },
    { p: "S.S.D", ...T("Kollu pethi", "கொள்ளுப்பேத்தி") },
    { p: "S.D.D", ...T("Kollu pethi", "கொள்ளுப்பேத்தி") },
    { p: "D.S.D", ...T("Kollu pethi", "கொள்ளுப்பேத்தி") },
    { p: "D.D.D", ...T("Kollu pethi", "கொள்ளுப்பேத்தி") },

    // All eight great-grandparent paths, not just the ones through a
    // grandfather: F.M.F and M.M.F used to fall through and compose as
    // "Paatti appa". Spelling takes the sandhi doubling the dictionaries use.
    // Attested as a translation of "great grandfather" alongside
    // கொள்ளுப்பாட்டன் (English-Tamil dictionary, ta.glosbe.com), with
    // பூட்டன் / பூட்டி the regional variant recorded for the Nadars of
    // southern Tamil Nadu and in Nagarathar usage.
    { p: "F.F.F", ...T("Kollu thatha", "கொள்ளுத்தாத்தா"), alt: "Poottan" },
    { p: "F.M.F", ...T("Kollu thatha", "கொள்ளுத்தாத்தா"), alt: "Poottan" },
    { p: "M.F.F", ...T("Kollu thatha", "கொள்ளுத்தாத்தா"), alt: "Poottan" },
    { p: "M.M.F", ...T("Kollu thatha", "கொள்ளுத்தாத்தா"), alt: "Poottan" },
    { p: "F.F.M", ...T("Kollu paatti", "கொள்ளுப்பாட்டி"), alt: "Pootti" },
    { p: "F.M.M", ...T("Kollu paatti", "கொள்ளுப்பாட்டி"), alt: "Pootti" },
    { p: "M.F.M", ...T("Kollu paatti", "கொள்ளுப்பாட்டி"), alt: "Pootti" },
    { p: "M.M.M", ...T("Kollu paatti", "கொள்ளுப்பாட்டி"), alt: "Pootti" },
    {
      p: "F.F.B", age: [2, 1],
      elder: T("Periya thatha", "பெரிய தாத்தா"),
      younger: T("Chinna thatha", "சின்ன தாத்தா"),
      verify: true
    },
    {
      p: "M.F.B", age: [2, 1],
      elder: T("Periya thatha", "பெரிய தாத்தா"),
      younger: T("Chinna thatha", "சின்ன தாத்தா"),
      verify: true
    }
  ]
};

export const PACKS = { english, tamil };
export const DEFAULT_PACK = "english";
