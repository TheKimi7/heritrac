import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { isDead, ageOf } from "../engine/kinship.js";

// The four sides mean the same thing everywhere in the app: up is a parent,
// down is a child, left is a brother or sister, right is a partner. Tap one
// to make that person, or drag from it onto another card to say that the two
// people already there are related that way. One thing to learn, two ways to
// use it.
export const SIDES = [
  { key: "parent", pos: Position.Top, handle: "t", label: "parent" },
  { key: "spouse", pos: Position.Right, handle: "r", label: "partner" },
  { key: "child", pos: Position.Bottom, handle: "b", label: "child" },
  { key: "sibling", pos: Position.Left, handle: "l", label: "brother or sister" }
];

// Two lines hold roughly forty characters at the full size, fifty two a step
// down and sixty two a step below that. Counted rather than measured, so it
// needs no canvas and cannot disagree with the fixed height the card is
// declared to have. Longer than the last tier and the name is clipped, which
// no real name reaches.
function nameSize(name) {
  if (name.length > 52) return " is-vlong";
  if (name.length > 40) return " is-long";
  return "";
}

function Card({ data, selected }) {
  const { person, term, flagged, pinned, lit, dim, ego, faded, onAdd, allow } = data;
  const dead = isDead(person);
  const when = person.death && typeof person.death.year === "number" ? person.death.year : null;
  const age = ageOf(person);
  // The corner says what is known: the year they died, or that they died at
  // all when nobody recorded when, or how old they are if they are living.
  const note = dead ? (when === null ? "died" : "d. " + when) : (age === null ? null : String(age));

  const cls = ["card"];
  if (ego) cls.push("is-ego");
  if (selected) cls.push("is-sel");
  if (lit) cls.push("is-lit");
  if (dim) cls.push("is-dim");
  if (faded) cls.push("is-faded");
  if (dead) cls.push("is-dead");

  return (
    <div className={cls.join(" ")}>
      <div className="card-top">
        <span className={"card-name" + nameSize(person.name)}>{person.name}</span>
        {note !== null && <span className="card-age">{note}</span>}
      </div>
      <div className="card-bottom">
        <span className={"chip" + (flagged ? " chip-warn" : "") + (pinned ? " chip-pin" : "")}>{term}</span>
        {person.ta && <span className="card-ta">{person.ta}</span>}
      </div>

      {SIDES.map((s) => {
        const open = allow[s.key] !== false;
        return (
          <Handle
            key={s.handle}
            id={s.handle}
            type="source"
            position={s.pos}
            isConnectableStart
            isConnectableEnd
            className={"plus plus-" + s.handle + (open ? "" : " is-shut")}
            title={open ? "Add a " + s.label + ", or drag onto another card" : "Drag onto another card"}
            aria-label={open ? "Add a " + s.label + " for " + person.name : s.label + " link for " + person.name}
            data-add={open ? s.key : undefined}
            data-for={person.id}
            onClick={open ? (e) => { e.stopPropagation(); onAdd(person.id, s.key, e.currentTarget); } : undefined}
          >
            {open ? <span className="plus-mark">+</span> : null}
          </Handle>
        );
      })}
    </div>
  );
}

export const PersonNode = memo(Card);

// The small dot where a couple's line meets the line down to their children.
export const UnionNode = memo(function Union({ data }) {
  return (
    <div className={"knot" + (data.lit ? " is-lit" : "") + (data.dim ? " is-dim" : "")}>
      <Handle id="l" type="target" position={Position.Left} className="knob-hidden" isConnectable={false} />
      <Handle id="r" type="target" position={Position.Right} className="knob-hidden" isConnectable={false} />
      <Handle id="b" type="source" position={Position.Bottom} className="knob-hidden" isConnectable={false} />
    </div>
  );
});
