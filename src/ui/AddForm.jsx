import { useEffect, useRef, useState } from "react";

const WORDS = {
  person: ["Man", "Woman"],
  parent: ["Father", "Mother"],
  child: ["Son", "Daughter"],
  sibling: ["Brother", "Sister"],
  spouse: ["Husband", "Wife"]
};

// One tap picks the word and the sex together, because every term the app
// works out needs to know which it is anyway.
export function AddForm({ at, kind, person, partners, onAdd, onClose }) {
  const [sex, setSex] = useState(kind === "parent" ? "M" : "M");
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [union, setUnion] = useState(partners.length ? partners[0].id : "");
  const field = useRef(null);

  useEffect(() => { if (field.current) field.current.focus(); }, []);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const [male, female] = WORDS[kind];
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) { if (field.current) field.current.focus(); return; }
    onAdd({ name, sex, born: year, union });
  };

  return (
    <form
      className="addform"
      style={{ left: at.x + "px", top: at.y + "px" }}
      onSubmit={submit}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="addform-head">
        {kind === "person"
          ? "A card of their own, linked to nobody yet"
          : <>{male} or {female.toLowerCase()} of <b>{person.name}</b></>}
      </p>
      <div className="seg">
        <button type="button" className={sex === "M" ? "on" : ""} onClick={() => setSex("M")}>{male}</button>
        <button type="button" className={sex === "F" ? "on" : ""} onClick={() => setSex("F")}>{female}</button>
      </div>
      <input
        ref={field}
        className="addform-name"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="addform-year"
        placeholder="Born: 1974, or 05-11-1974"
        value={year}
        onChange={(e) => setYear(e.target.value.replace(/[^0-9/.\- ]/g, "").slice(0, 10))}
      />
      {partners.length > 1 && (
        <label className="addform-with">
          With
          <select value={union} onChange={(e) => setUnion(e.target.value)}>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      )}
      <div className="addform-row">
        <button type="submit" className="btn btn-go">Add</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}
