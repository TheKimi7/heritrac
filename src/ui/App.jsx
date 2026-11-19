import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  useReactFlow, useViewport
} from "@xyflow/react";

import { SAMPLE } from "../engine/data.js";
import { PACKS } from "../engine/packs.js";
import { WORD_SETS, wordsFor, withWords, clearWords } from "../engine/wordset.js";
import { buildIndex, resolveAll, ageOf, isDead, MAX_STEPS } from "../engine/kinship.js";
import { tidy, NODE_W, NODE_H, ROW, KNOT } from "../engine/layout.js";
import * as M from "../engine/mutate.js";
import {
  normalise, emptyTree, serialise, fileName, embedded,
  forget, readFamily, fingerprint
} from "../engine/file.js";
import { formatDate } from "../engine/dates.js";
import { PersonNode, UnionNode } from "./PersonNode.jsx";
import { AddForm } from "./AddForm.jsx";

const nodeTypes = { person: PersonNode, union: UnionNode };
const PID = (id) => "p:" + id;
const UID = (id) => "u:" + id;

function bandName(rel) {
  if (rel === 0) return "Your generation";
  if (rel === 1) return "Parents";
  if (rel === -1) return "Children";
  if (rel === 2) return "Grandparents";
  if (rel === -2) return "Grandchildren";
  const great = "Great-".repeat(Math.abs(rel) - 2);
  return great + (rel > 0 ? "grandparents" : "grandchildren");
}

const Icon = {
  burger: "M3 6h14M3 10h14M3 14h14",
  plus: "M10 4v12M4 10h12",
  minus: "M4 10h12",
  fit: "M4 7V4h3M16 7V4h-3M4 13v3h3M16 13v3h-3"
};

function Glyph({ d, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Its own component so that panning repaints the labels and nothing else.
function BandRail({ bands }) {
  const { x, y, zoom } = useViewport();
  return (
    <div className="bandrail" aria-hidden="true">
      {bands.map((b) => {
        const top = y + b.y * zoom;
        if (top < 16 || top > window.innerHeight - 24) return null;
        return <span key={b.label} style={{ top: top + "px" }}>{b.label}</span>;
      })}
    </div>
  );
}

// Every visit starts here. Nothing is read back from this browser, so the
// sample is what loads, every time, for everybody.
const fresh = () => normalise(SAMPLE);

function Flow() {
  const [tree, setTreeRaw] = useState(fresh);
  // The tree as it last existed somewhere the reader can get it back from: on
  // first load that is the shipped sample, and after that whatever they
  // downloaded, copied or opened. Anything else on screen is unsaved.
  const [savedMark, setSavedMark] = useState(() => fingerprint(fresh()));
  const [confirming, setConfirming] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);
  const [adding, setAdding] = useState(null);
  const [linking, setLinking] = useState(null);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [moved, setMoved] = useState({});
  const [sideOpen, setSideOpen] = useState(() => window.innerWidth > 900);
  const [linkKind, setLinkKind] = useState("child");
  const [linkWho, setLinkWho] = useState("");
  const anchor = useRef(null);
  const fileInput = useRef(null);
  const flow = useReactFlow();

  const say = useCallback((text) => {
    setToast(text);
    window.clearTimeout(say.t);
    say.t = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const setTree = useCallback((next, note) => {
    setTreeRaw(next);
    setMoved({});
    if (note) say(note);
  }, [say]);

  // Adopting a family, or starting from the sample or an empty tree, makes the
  // new state the saved one: in each case the reader can get it back.
  const setTreeSaved = useCallback((next, note) => {
    setTree(next, note);
    setSavedMark(fingerprint(next));
  }, [setTree]);

  const mark = useMemo(() => fingerprint(tree), [tree]);
  const dirty = mark !== savedMark;

  // An older build of this page did save the tree here. Clear whatever it
  // left, so a family entered under a previous version does not sit in this
  // browser indefinitely.
  useEffect(() => { forget(); }, []);

  // Escape closes the JSON dialog. Bound while it is open and taken off
  // again, so the key does nothing the rest of the time.
  useEffect(() => {
    if (!sheet) return undefined;
    const bail = (e) => { if (e.key === "Escape") { e.stopPropagation(); setSheet(null); } };
    window.addEventListener("keydown", bail, true);
    return () => window.removeEventListener("keydown", bail, true);
  }, [sheet]);

  // The browser will not let a page choose the words in this dialog, so the
  // reader sees the generic "Leave site?" one. The handler is attached only
  // while something would actually be lost, which also leaves the page
  // eligible for the back/forward cache the rest of the time.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Anything that replaces the whole family asks first, but only when there is
  // something to lose. Not window.confirm: a modal can be suppressed in an
  // embedded frame, and then the family would go without a word.
  const guard = useCallback((why, go) => {
    if (!dirty) { go(); return; }
    setConfirming({ why, go });
  }, [dirty]);

  const ego = tree.settings.ego;
  // One naming system, always. A reader who wants different words types them
  // in, or loads a set of them; see the word sets in the panel.
  const pack = PACKS.english;

  const ix = useMemo(() => buildIndex(tree), [tree]);
  const rel = useMemo(() => resolveAll(pack, ix, ego, MAX_STEPS), [pack, ix, ego]);
  const layout = useMemo(() => tidy(ix, ego), [ix, ego]);

  // After anything is added the clicked card must stay where it was on
  // screen, or the relayout throws the viewport somewhere else.
  useEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    if (!a) return;
    const now = layout.at.get(a.id);
    if (!now) return;
    const v = flow.getViewport();
    flow.setViewport({ x: v.x - (now.x - a.x) * v.zoom, y: v.y - (now.y - a.y) * v.zoom, zoom: v.zoom });
  }, [layout, flow]);

  const sameIsland = useCallback((id) => {
    if (!ix.component) return true;
    return ix.component.get(id) === ix.component.get(ego);
  }, [ix, ego]);

  const termOf = useCallback((id) => {
    const pin = tree.overrides[ego + ">" + id];
    if (pin) return { text: pin, pinned: true, flagged: false };
    const r = rel.get(id);
    if (!r) return { text: "", flagged: false };
    if (r.unreachable) {
      return { text: sameIsland(id) ? "Too far to work out" : "Not linked yet", flagged: false, pinned: false };
    }
    return { text: r.term, flagged: !!r.verify, pinned: false };
  }, [tree.overrides, ego, rel, sameIsland]);

  // Which cards and lines are part of the chain from you to whoever is under
  // the pointer. Nothing animates: it is one class, on and off.
  const chain = useMemo(() => {
    const out = { people: new Set(), unions: new Set(), edges: new Set() };
    const id = hover || selected;
    if (!id) return out;
    const r = rel.get(id);
    const via = (r && r.via) || [];
    via.forEach((p) => out.people.add(p));
    for (let i = 1; i < via.length; i++) {
      const a = via[i - 1];
      const b = via[i];
      for (const uid of (ix.unionsOf.get(a) || [])) {
        const u = ix.unions.get(uid);
        if (!u) continue;
        const holds = (x) => (u.spouses || []).includes(x) || (u.children || []).includes(x);
        if (!holds(b)) continue;
        out.unions.add(uid);
        out.edges.add((u.spouses.includes(a) ? "s" : "c") + ":" + uid + ":" + a);
        out.edges.add((u.spouses.includes(b) ? "s" : "c") + ":" + uid + ":" + b);
        break;
      }
    }
    return out;
  }, [hover, selected, rel, ix]);

  const match = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hits = new Set();
    for (const [id, p] of ix.persons) {
      if ((p.name || "").toLowerCase().includes(q) || (p.ta || "").includes(query.trim())) hits.add(id);
    }
    return hits;
  }, [query, ix]);

  const openAdd = useCallback((personId, kind, el) => {
    const box = el.getBoundingClientRect();
    const x = Math.min(Math.max(box.left - 120, 12), window.innerWidth - 272);
    const y = Math.min(box.bottom + 8, window.innerHeight - 300);
    setAdding({ personId, kind, at: { x, y } });
  }, []);

  const nodes = useMemo(() => {
    const list = [];
    const egoGen = ix.generation.get(ego) || 0;
    for (const [id, person] of ix.persons) {
      const base = layout.at.get(id);
      const pos = moved[id] || { x: base.x - NODE_W / 2, y: base.y - NODE_H / 2 };
      const r = rel.get(id);
      const t = termOf(id);
      const parents = (ix.parentsOf.get(id) || []).length;
      const own = (ix.unionsOf.get(id) || []).filter((uid) => (ix.unions.get(uid).spouses || []).includes(id));
      list.push({
        id: PID(id),
        type: "person",
        position: pos,
        // Both cards and knots are a fixed size in the stylesheet, so their
        // dimensions are declared rather than measured. Without this React
        // Flow holds a node at visibility:hidden until its ResizeObserver
        // reports a size, and a dropped notification leaves the card
        // invisible for good: present in the DOM, taking up layout, absent
        // from the screen and from hit testing.
        width: NODE_W,
        height: NODE_H,
        selected: selected === id,
        data: {
          person,
          term: t.text || "Not linked yet",
          flagged: t.flagged,
          pinned: t.pinned,
          ego: id === ego,
          lit: chain.people.has(id),
          dim: (hover || selected) ? !chain.people.has(id) : false,
          // Only the people the app could not work out a word for fade back.
          // There used to be a distance slider doing this as well, which in a
          // large family greyed out almost everybody, which is the opposite
          // of what a large family needs.
          faded: sameIsland(id) && (!r || r.unreachable),
          onAdd: openAdd,
          allow: { parent: parents < 2, child: true, sibling: true, spouse: true },
          unions: own.length
        }
      });
    }
    for (const [uid, knot] of layout.knots) {
      list.push({
        id: UID(uid),
        type: "union",
        position: { x: knot.x - KNOT / 2, y: knot.y - KNOT / 2 },
        width: KNOT,
        height: KNOT,
        draggable: false,
        selectable: false,
        data: { lit: chain.unions.has(uid), dim: (hover || selected) ? !chain.unions.has(uid) : false }
      });
    }
    return list;
  }, [ix, layout, rel, termOf, selected, hover, chain, moved, ego, openAdd, sameIsland]);

  const edges = useMemo(() => {
    const list = [];
    for (const [uid, knot] of layout.knots) {
      const u = ix.unions.get(uid);
      const sp = (u.spouses || []).filter((s) => ix.persons.has(s));
      for (const s of sp) {
        const left = layout.at.get(s).x <= knot.x;
        list.push({
          id: "s:" + uid + ":" + s,
          source: PID(s),
          sourceHandle: left ? "r" : "l",
          target: UID(uid),
          targetHandle: left ? "l" : "r",
          type: "smoothstep",
          className: "line line-spouse" + (chain.edges.has("s:" + uid + ":" + s) ? " is-lit" : ""),
          focusable: false,
          selectable: false
        });
      }
      for (const c of (u.children || []).filter((x) => ix.persons.has(x))) {
        list.push({
          id: "c:" + uid + ":" + c,
          source: UID(uid),
          sourceHandle: "b",
          target: PID(c),
          targetHandle: "t",
          type: "smoothstep",
          pathOptions: { borderRadius: 18 },
          className: "line" + (chain.edges.has("c:" + uid + ":" + c) ? " is-lit" : ""),
          focusable: false,
          selectable: false
        });
      }
    }
    return list;
  }, [layout, ix, chain]);

  /* ----------------------------------------------------------- handlers */

  const onNodesChange = useCallback((changes) => {
    const next = { ...moved };
    let touched = false;
    for (const c of changes) {
      if (c.type === "position" && c.position && c.id.startsWith("p:")) {
        next[c.id.slice(2)] = c.position;
        touched = true;
      }
    }
    if (touched) setMoved(next);
  }, [moved]);

  const joinUp = useCallback((kind, a, b) => {
    if (!a || !b || a === b) return;
    const res = M.link(tree, kind, a, b);
    if (res.error) { say(res.error); return; }
    const was = layout.at.get(a);
    if (was) anchor.current = { id: a, x: was.x, y: was.y };
    const name = ix.persons.has(b) ? ix.persons.get(b).name : "They";
    setTree(res.tree, name + " linked.");
  }, [tree, layout, ix, setTree, say]);

  // Which card a drag was dropped on. React Flow answers this from its own
  // node lookup, and a union knot is a node too: it is ten pixels across and
  // sits at a couple's midpoint, which can fall inside a loose card drawn on
  // the same row. When the knot won, this handler used to see a "u:" id, fall
  // through its guard and do nothing at all, with no message, so the drop
  // looked simply ignored. Whether it happened depended on the layout, so it
  // came and went between families and was stable within one.
  const droppedOn = useCallback((event, state) => {
    const named = state && state.toNode && state.toNode.id;
    if (named && named.startsWith("p:")) return named.slice(2);
    const touch = event && event.changedTouches && event.changedTouches[0];
    const x = touch ? touch.clientX : event && event.clientX;
    const y = touch ? touch.clientY : event && event.clientY;
    if (typeof x !== "number" || typeof y !== "number") return null;
    const under = document.elementFromPoint(x, y);
    const card = under && under.closest && under.closest('[data-id^="p:"]');
    return card ? card.getAttribute("data-id").slice(2) : null;
  }, []);

  const onConnectEnd = useCallback((event, state) => {
    if (!state || state.isValid) return;
    const from = state.fromNode && state.fromNode.id;
    if (!from || !from.startsWith("p:")) return;
    const to = droppedOn(event, state);
    const kind = { t: "parent", b: "child", l: "sibling", r: "spouse" }[state.fromHandle && state.fromHandle.id] || "spouse";
    if (!to) { say("Drop it on another card to join them up."); return; }
    if (to === from.slice(2)) return;
    joinUp(kind, from.slice(2), to);
  }, [joinUp, droppedOn, say]);

  const onConnect = useCallback((conn) => {
    if (!conn.source || !conn.target) return;
    if (!conn.source.startsWith("p:") || !conn.target.startsWith("p:")) return;
    const kind = { t: "parent", b: "child", l: "sibling", r: "spouse" }[conn.sourceHandle] || "spouse";
    joinUp(kind, conn.source.slice(2), conn.target.slice(2));
  }, [joinUp]);

  // Loading a set of words is one change, not one per person, so it takes a
  // single undo and reads as a single thing in the saved file.
  const loadWords = useCallback((setId, inScript) => {
    const got = wordsFor(tree, ix, ego, setId, inScript);
    if (!got.filled) {
      say(got.kept
        ? "You have already named everybody this reaches from here."
        : "There is nobody here to name yet.");
      return;
    }
    const bits = [got.filled + " named"];
    if (got.kept) bits.push(got.kept + " of yours kept");
    if (got.unsure) bits.push(got.unsure + " left in English to check");
    if (got.far) bits.push(got.far + " out of reach");
    setTree(withWords(tree, got.words), bits.join(", ") + ".");
  }, [tree, ix, ego, setTree, say]);

  const clearMine = useCallback(() => {
    const done = clearWords(tree, ego);
    if (!done.cleared) { say("You have no words of your own from here."); return; }
    setTree(done.tree, done.cleared + (done.cleared === 1 ? " word" : " words") + " cleared.");
  }, [tree, ego, setTree, say]);

  const doAdd = useCallback(({ name, sex, born, union }) => {
    const { personId, kind } = adding;
    const draft = { name, sex, born };
    let res;
    if (kind === "person") res = M.addPerson(tree, draft);
    else if (kind === "parent") res = M.addParent(tree, personId, draft);
    else if (kind === "child") res = M.addChild(tree, personId, draft, union || undefined);
    else if (kind === "sibling") res = M.addSibling(tree, personId, draft, true);
    else res = M.addSpouse(tree, personId, draft);
    if (res.error) { say(res.error); return; }
    const was = kind === "person" ? null : layout.at.get(personId);
    if (was) anchor.current = { id: personId, x: was.x, y: was.y };
    setAdding(null);
    setSelected(res.id);
    setTree(res.tree);
    if (kind === "person") {
      // A loose card lands at the end of the row, so go and look at it.
      setLanded(res.id);
      say("New card. Link it from any of its four sides.");
    }
  }, [adding, tree, layout, setTree, say]);

  // Centre on a card that has just been made away from everything else.
  const [landed, setLanded] = useState(null);
  useEffect(() => {
    if (!landed) return;
    const p = layout.at.get(landed);
    if (p) flow.setCenter(p.x, p.y, { zoom: 0.9, duration: 0 });
    setLanded(null);
  }, [landed, layout, flow]);

  const adopt = useCallback((raw, note) => {
    const read = readFamily(raw);
    if (read.error) { say(read.error); return false; }
    const extra = read.dropped
      ? " " + read.dropped + (read.dropped === 1 ? " entry was" : " entries were") + " not readable and were left out."
      : "";
    setTreeSaved(read.tree, (note || "Family loaded.") + extra);
    setSelected(null);
    window.setTimeout(() => flow.fitView({ padding: 0.2, duration: 0 }), 50);
    return true;
  }, [setTreeSaved, say, flow]);

  const download = useCallback(() => {
    const text = serialise(tree);
    if (embedded()) {
      setSheet({ mode: "copy", text, why: "This preview cannot save files. Copy the text, or open the app on its own page." });
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName(tree);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setSavedMark(fingerprint(tree));
      say("Saved to your downloads.");
    } catch (e) {
      setSheet({ mode: "copy", text, why: "The download did not start, so here is the text." });
    }
  }, [tree, say]);

  const onFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => adopt(String(reader.result), file.name + " loaded.");
    reader.readAsText(file);
  }, [adopt]);

  const sel = selected ? ix.persons.get(selected) : null;
  const links = useMemo(
    () => (selected ? M.linksOf(tree, selected).filter((l) => ix.persons.has(l.id)) : []),
    [tree, selected, ix]
  );
  const selRel = selected ? rel.get(selected) : null;
  const selTerm = selected ? termOf(selected) : null;
  const partnersOf = (id) => {
    const own = (ix.unionsOf.get(id) || []).filter((uid) => (ix.unions.get(uid).spouses || []).includes(id));
    return own.map((uid) => {
      const other = (ix.unions.get(uid).spouses || []).filter((s) => s !== id && ix.persons.has(s));
      return { id: uid, label: other.length ? other.map((o) => ix.persons.get(o).name).join(" and ") : "no partner recorded" };
    });
  };

  const bands = useMemo(() => {
    const egoY = layout.at.has(ego) ? layout.at.get(ego).y : 0;
    const ys = new Set();
    for (const p of layout.at.values()) ys.add(p.y);
    return [...ys]
      .sort((a, b) => a - b)
      .map((y) => ({ y: y - 96, label: bandName(Math.round((egoY - y) / ROW)) }));
  }, [layout, ego]);

  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const p = layout.at.get(ego);
    if (!p) return;
    const wide = window.innerWidth > 900;
    flow.setCenter(p.x, p.y, { zoom: wide ? 0.85 : 0.62, duration: 0 });
    if (wide && sideOpen) {
      const v = flow.getViewport();
      flow.setViewport({ x: v.x + 172, y: v.y, zoom: v.zoom });
    }
  }, [layout, ego, flow, sideOpen]);

  return (
    <div className={"app" + (sideOpen ? " side-open" : "")}>
      <div className="brandbar">
        <button
          className="burger"
          id="burger"
          aria-label={sideOpen ? "Hide the panel" : "Show the panel"}
          aria-expanded={sideOpen}
          onClick={() => setSideOpen(!sideOpen)}
        ><Glyph d={Icon.burger} /></button>
        <span className="brandname">heriTrac</span>
        {dirty && <span className="chip chip-warn" id="unsaved">Unsaved</span>}
      </div>

      <aside className="side" hidden={!sideOpen}>
        <header className="side-head">
          <p>A family tree that works out what everyone is to you, instead of asking you to type it in.</p>
        </header>

        <div className="viewing">
          <div>
            <b>{ix.persons.has(ego) ? ix.persons.get(ego).name : "Nobody"}</b>
            <span>every word below is from here</span>
          </div>
          {selected && selected !== ego && (
            <button className="btn" onClick={() => { setTree(normalise({ ...tree, settings: { ...tree.settings, ego: selected } })); }}>
              View as {ix.persons.get(selected).name.split(" ")[0]}
            </button>
          )}
        </div>

        <div className="side-sec">
          <label className="lab" htmlFor="q">Find someone</label>
          <input id="q" className="text" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
          {match && (
            <ul className="hits">
              {[...match].slice(0, 6).map((id) => (
                <li key={id}>
                  <button className="hit" onClick={() => { setSelected(id); const p = layout.at.get(id); flow.setCenter(p.x, p.y, { zoom: 0.9, duration: 0 }); }}>
                    {ix.persons.get(id).name}
                    <span>{termOf(id).text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="side-sec">
          <label className="lab">Words of your own</label>
          <p className="note">
            Everybody is named in English. Click a card and type your own word
            for that person; it holds for this viewpoint.
          </p>
          <p className="note">
            Or load a whole vocabulary. Tamil reads a family differently, so a
            father's brother's son comes out a brother rather than a cousin.
            Anything already here is kept, and words this app is unsure of are
            left in English.
          </p>
          {WORD_SETS.map((set) => (
            <div className="row" key={set.id}>
              <button
                className="btn"
                id={"words-" + set.id}
                onClick={() => loadWords(set.id, false)}
              >{set.label} words</button>
              <button
                className="btn"
                id={"words-" + set.id + "-script"}
                onClick={() => loadWords(set.id, true)}
              >{set.script}</button>
            </div>
          ))}
          <button className="btn btn-quiet" id="words-clear" onClick={clearMine}>
            Clear my words here
          </button>
        </div>

        <div className="side-sec grow">
          <label className="lab">Selected</label>
          {!sel && <p className="note">Click a card to see how its word was worked out, change it, or add relatives. The four plus buttons on a card add a parent, a partner, a child, or a brother or sister.</p>}
          {sel && (
            <div className="detail">
              <h2>{sel.name}</h2>
              <p className={"big" + (selTerm.flagged ? " warn" : "")}>{selTerm.text || "Not linked yet"}</p>
              <dl className="kv">
                {sel.birth && sel.birth.year && <><dt>Born</dt><dd>{formatDate(sel.birth)}{ageOf(sel) !== null ? ", age " + ageOf(sel) : ""}</dd></>}
                {sel.death && sel.death.year && <><dt>Died</dt><dd>{formatDate(sel.death)}</dd></>}
                {isDead(sel) && !(sel.death && sel.death.year) && <><dt>Died</dt><dd>Year not known</dd></>}
                {selRel && !selRel.unreachable && <><dt>Side</dt><dd>{selRel.side}</dd></>}
                {selRel && !selRel.unreachable && <><dt>Chain</dt><dd className="mono">{(selRel.via || []).map((v) => ix.persons.get(v).name.split(" ")[0]).join(" > ")}</dd></>}
              </dl>
              {selRel && selRel.note && <p className="note">{selRel.note}</p>}
              {selRel && selRel.verify && <p className="note warn">This word varies between families. Type in the one you use and it is kept.</p>}
              {selRel && selRel.candidates && selRel.candidates.filter((c, i) => i > 0 && !c.composed).length > 0 && (
                <div className="alts">
                  <span className="lab">Also correct</span>
                  {selRel.candidates
                    .filter((c, i) => i > 0 && !c.composed)
                    .map((c, i) => <span key={i} className="chip">{c.term}</span>)}
                </div>
              )}
              <label className="lab" htmlFor="pname">Details</label>
              {/* The fields are uncontrolled, so the key carries what they are
                  showing and not just who: typing a year of death makes
                  somebody dead, and the box above would otherwise go on
                  saying Living until the card was selected again. */}
              <div className="stack" key={"edit-" + selected + (isDead(sel) ? "-d" : "-l")}>
                <input id="pname" className="text" defaultValue={sel.name} placeholder="Name" />
                <select id="psex" className="text" defaultValue={sel.sex === "F" ? "F" : "M"}>
                  <option value="M">Man</option>
                  <option value="F">Woman</option>
                </select>
                <div className="btns">
                  <input id="pyear" className="text" placeholder="Born"
                    defaultValue={formatDate(sel.birth)} />
                  <input id="pdeath" className="text" placeholder="Died"
                    defaultValue={formatDate(sel.death)} />
                </div>
                {/* For the person everybody knows has died, where nobody can
                    say when. Filling the Died box above says the same thing
                    and more, so that wins and this falls back into step. */}
                <select id="pliving" className="text" defaultValue={isDead(sel) ? "dead" : "living"}>
                  <option value="living">Living</option>
                  <option value="dead">No longer living</option>
                </select>
                <p className="note">A year on its own, or the whole date as 05-11-1974. Leave Died empty and still mark somebody as no longer living if the year is not known.</p>
                <button
                  className="btn btn-tint"
                  id="psave"
                  onClick={() => {
                    setTree(M.updatePerson(tree, selected, {
                      name: document.getElementById("pname").value,
                      sex: document.getElementById("psex").value,
                      born: document.getElementById("pyear").value,
                      died: document.getElementById("pdeath").value,
                      dead: document.getElementById("pliving").value === "dead"
                    }), "Details saved.");
                  }}
                >Save details</button>
              </div>

              {links.length > 0 && (
                <>
                  <label className="lab">Linked to</label>
                  <ul className="links">
                    {links.map((l) => (
                      <li key={l.id}>
                        <span className="links-name">{ix.persons.get(l.id).name}</span>
                        <span className="links-how">{l.how}</span>
                        <button
                          className="btn btn-warn"
                          data-unlink={l.id}
                          onClick={() => setTree(M.unlink(tree, selected, l.id).tree,
                            "Unlinked from " + ix.persons.get(l.id).name + ".")}
                        >Unlink</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <label className="lab" htmlFor="ovr">Your own word</label>
              <div className="row">
                <input
                  id="ovr"
                  className="text"
                  defaultValue={tree.overrides[ego + ">" + selected] || ""}
                  // The field is uncontrolled, so the key carries the word
                  // itself and not just who it is for: loading a set of words
                  // changes neither the viewpoint nor the selection, and
                  // without the word in here the box would go on showing
                  // whatever it held before the load.
                  key={ego + ">" + selected + ">" + (tree.overrides[ego + ">" + selected] || "")}
                  onKeyDown={(e) => { if (e.key === "Enter") { setTree(M.setOverride(tree, ego, selected, e.currentTarget.value), "Word saved."); } }}
                  placeholder="leave empty to use the worked out word"
                />
                <button
                  className="btn btn-tint"
                  id="ovrsave"
                  onClick={() => setTree(M.setOverride(tree, ego, selected, document.getElementById("ovr").value), "Word saved.")}
                >Save</button>
              </div>
              <label className="lab" htmlFor="linkkind">Link to someone already here</label>
              <div className="stack">
                <select id="linkkind" className="text" value={linkKind} onChange={(e) => setLinkKind(e.target.value)}>
                  <option value="parent">is their parent</option>
                  <option value="child">is their child</option>
                  <option value="sibling">is their brother or sister</option>
                  <option value="spouse">is their partner</option>
                </select>
                <select id="linkwho" className="text" value={linkWho} onChange={(e) => setLinkWho(e.target.value)}>
                  <option value="">pick a person</option>
                  {[...ix.persons.values()]
                    .filter((p) => p.id !== selected)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                  className="btn"
                  id="linkgo"
                  onClick={() => {
                    if (!linkWho) return;
                    joinUp(linkKind, selected, linkWho);
                    setLinkWho("");
                    // Whoever you joined up may have been on the far side of
                    // the drawing, so go to where the pair ended up.
                    setLanded(selected);
                  }}
                >Link</button>
              </div>
              <div className="btns">
                <button className="btn btn-tint" onClick={() => { setTree(normalise({ ...tree, settings: { ...tree.settings, ego: selected } })); }}>View as this person</button>
                <button
                  className="btn btn-warn"
                  onClick={() => {
                    if (selected === ego) { say("You cannot remove the person you are viewing as."); return; }
                    const name = sel.name;
                    setSelected(null);
                    setTree(M.removePerson(tree, selected), name + " removed.");
                  }}
                >Remove</button>
              </div>
            </div>
          )}
        </div>

        <div className="side-sec">
          <label className="lab">Add somebody</label>
          <div className="btns one">
            <button
              className="btn btn-go"
              id="newcard"
              onClick={(e) => setAdding({ personId: null, kind: "person", at: { x: Math.min(e.currentTarget.getBoundingClientRect().left, window.innerWidth - 272), y: Math.min(e.currentTarget.getBoundingClientRect().bottom + 8, window.innerHeight - 300) } })}
            >New card</button>
          </div>
          <p className="note">Or use the four plus buttons on any card: up a parent, down a child, left a brother or sister, right a partner. Drag from one of those dots onto another card to link two people who are already here.</p>
        </div>

        <div className="side-sec">
          <label className="lab">Your family file</label>
          <p className="note" id="privacy">
            {dirty
              ? "Nothing is saved anywhere. Download or copy this family before you close the tab, or it is gone."
              : "This family is never stored in your browser. It lives in this tab only, and leaves as a file you keep."}
          </p>
          <div className="btns">
            <button className="btn" id="dl" onClick={download}>Download</button>
            <button className="btn" id="up" onClick={() => fileInput.current && fileInput.current.click()}>Upload</button>
            <button
              className="btn"
              id="copy"
              onClick={() => {
                setSheet({ mode: "copy", text: serialise(tree) });
                setSavedMark(fingerprint(tree));
              }}
            >Copy</button>
            <button className="btn" id="paste" onClick={() => guard("Pasting a family replaces the one on screen.", () => setSheet({ mode: "paste", text: "" }))}>Paste</button>
            <button className="btn" id="blank" onClick={() => guard("Starting empty clears the family on screen.", () => { setSelected(null); setTreeSaved(emptyTree(), "Empty tree. Start with yourself."); })}>Start empty</button>
            <button className="btn" id="sample" onClick={() => guard("Loading the sample replaces the family on screen.", () => { setSelected(null); adopt(JSON.stringify(SAMPLE), "Sample family loaded."); })}>Load the sample</button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files[0];
              e.target.value = "";
              guard("Opening a file replaces the family on screen.", () => onFile(file));
            }}
          />
          <p className="note">Everything stays in this browser. Download a copy before you clear site data.</p>
        </div>
      </aside>

      <div
        className="stage"
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          connectionDragThreshold={6}
          connectionRadius={46}
          onNodeMouseEnter={(_, n) => n.id.startsWith("p:") && setHover(n.id.slice(2))}
          onNodeMouseLeave={() => setHover(null)}
          onNodeClick={(_, n) => {
            if (!n.id.startsWith("p:")) return;
            setSelected(n.id.slice(2));
            if (window.innerWidth > 900) setSideOpen(true);
          }}
          onPaneClick={() => { setSelected(null); setAdding(null); }}
          connectOnClick={false}
          connectionMode="loose"
          minZoom={0.08}
          maxZoom={2.2}
          // The built-in badge is hidden so the credit below can take its
          // place. It is a replacement, not a removal: React Flow is still
          // named, and in words rather than in a corner mark.
          proOptions={{ hideAttribution: true }}
          nodesFocusable
          elevateNodesOnSelect={false}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1} className="grid" />
        </ReactFlow>

        <p className="credit">
          Made with <span className="credit-mark" role="img" aria-label="brain">{"\u{1F9E0}"}</span> using{" "}
          <a href="https://reactflow.dev" target="_blank" rel="noreferrer noopener">React Flow</a>
        </p>

        <BandRail bands={bands} />

        <div className="dock">
          <button className="dockbtn" id="zoomin" title="Zoom in" aria-label="Zoom in"
            onClick={() => flow.zoomIn()}><Glyph d={Icon.plus} /></button>
          <button className="dockbtn" id="zoomout" title="Zoom out" aria-label="Zoom out"
            onClick={() => flow.zoomOut()}><Glyph d={Icon.minus} /></button>
          <button
            className="dockbtn dockbtn-add"
            id="dockadd"
            title="New card"
            aria-label="Add a new card"
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              setAdding({
                personId: null,
                kind: "person",
                at: { x: Math.max(12, box.left - 236), y: Math.max(12, box.top - 240) }
              });
            }}
          ><Glyph d={Icon.plus} size={22} /></button>
          <button className="dockbtn" id="fit" title="Fit the whole family" aria-label="Fit the whole family"
            onClick={() => flow.fitView({ padding: 0.2, duration: 0 })}><Glyph d={Icon.fit} /></button>
        </div>

        {adding && (
          <AddForm
            at={adding.at}
            kind={adding.kind}
            person={ix.persons.get(adding.personId) || { name: "" }}
            partners={adding.kind === "child" ? partnersOf(adding.personId) : []}
            onAdd={doAdd}
            onClose={() => setAdding(null)}
          />
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>

      {confirming && (
        <div className="bar" id="confirmbar">
          <p className="note warn">
            {confirming.why} Nothing is stored in this browser, so the family on
            screen cannot be recovered once it is replaced.
          </p>
          <div className="row">
            {/* Saves and closes, without going on to replace anything. In an
                embedded frame download() opens the copy sheet instead, and
                proceeding here would put two sheets on top of each other. */}
            <button
              className="btn btn-go"
              id="confirm-save"
              onClick={() => { download(); setConfirming(null); }}
            >Save it first</button>
            <button
              className="btn btn-warn"
              id="confirm-go"
              onClick={() => { const go = confirming.go; setConfirming(null); go(); }}
            >Replace it anyway</button>
            <button className="btn" id="confirm-no" onClick={() => setConfirming(null)}>Cancel</button>
          </div>
        </div>
      )}

      {sheet && (
        // A dialog rather than a tray along the bottom: a whole family as
        // JSON is a document, and it wants room and a way to scroll through
        // it. mousedown, not click, so a selection that starts on the text
        // and finishes out on the backdrop does not close the thing.
        <div
          className="sheet-back"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSheet(null); }}
        >
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetwhy">
            <p className="note" id="sheetwhy">
              {sheet.why || (sheet.mode === "copy"
                ? "This is your whole family as JSON. Keep it somewhere safe, or paste it into another browser."
                : "Paste a family file here and it replaces what is on screen.")}
            </p>
            <textarea
              autoFocus
              defaultValue={sheet.text}
              id="sheettext"
              spellCheck={false}
              onFocus={(e) => sheet.mode === "copy" && e.target.select()}
            />
            <div className="row sheet-foot">
              {sheet.mode === "paste" && (
                <button
                  className="btn btn-go"
                  id="sheetload"
                  onClick={() => {
                    const ok = adopt(document.getElementById("sheettext").value);
                    if (ok) setSheet(null);
                  }}
                >Load this</button>
              )}
              <button className="btn" id="sheetclose" onClick={() => setSheet(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
