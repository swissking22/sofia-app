import React from "react";
import { FormField } from "../index";
import type {
  StructureClass,
  StructureLevel,
  StructureSection,
  StructureSpecialization,
} from "../../../lib/academic-structure";
import { suggestClassNames } from "../../../lib/academic-structure";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

interface ClassBuilderProps {
  levels: StructureLevel[];
  sections: StructureSection[];
  specializations: StructureSpecialization[];
  onCreate: (input: {
    academic_level_id: string;
    section_id: string;
    specialization_id?: string | null;
    name: string;
    capacity?: number | null;
  }) => Promise<string | null>;
  onUpdate?: (input: {
    id: string;
    academic_level_id: string;
    section_id: string;
    specialization_id?: string | null;
    name: string;
    capacity?: number | null;
  }) => Promise<string | null>;
  editingClass?: StructureClass | null;
  onCancelEdit?: () => void;
}

export function ClassBuilder({
  levels,
  sections,
  specializations,
  onCreate,
  onUpdate,
  editingClass,
  onCancelEdit,
}: ClassBuilderProps) {
  const activeLevels = levels.filter((l) => l.is_active === 1);
  const activeSections = sections.filter((s) => s.is_active === 1);

  const [levelId, setLevelId] = React.useState("");
  const [sectionId, setSectionId] = React.useState("");
  const [specId, setSpecId] = React.useState("");
  const [name, setName] = React.useState("");
  const [capacity, setCapacity] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [touchedName, setTouchedName] = React.useState(false);

  React.useEffect(() => {
    if (!editingClass) return;
    setLevelId(editingClass.academic_level_id ?? "");
    setSectionId(editingClass.section_id ?? "");
    setSpecId(editingClass.specialization_id ?? "");
    setName(editingClass.name);
    setCapacity(
      editingClass.capacity != null ? String(editingClass.capacity) : "",
    );
    setTouchedName(true);
    setError("");
  }, [editingClass]);

  const level = activeLevels.find((l) => l.id === levelId);
  const section = activeSections.find((s) => s.id === sectionId);
  const sectionSpecs = specializations.filter(
    (s) => s.section_id === sectionId && s.is_active === 1,
  );
  const spec = sectionSpecs.find((s) => s.id === specId);

  const suggestions =
    level && section
      ? suggestClassNames({
          levelName: level.name,
          sectionName: section.name,
          specializationAbbreviation: spec?.abbreviation,
        })
      : [];

  React.useEffect(() => {
    if (touchedName || editingClass) return;
    if (suggestions[0]) setName(suggestions[0]);
    // suggestions[0] is derived from level/section/spec selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId, sectionId, specId, touchedName, editingClass]);

  React.useEffect(() => {
    if (!specId) return;
    const stillValid = specializations.some(
      (s) => s.id === specId && s.section_id === sectionId && s.is_active === 1,
    );
    if (!stillValid) setSpecId("");
  }, [sectionId, specId, specializations]);

  async function handleSubmit() {
    setError("");
    if (!levelId) {
      setError("Select an academic level.");
      return;
    }
    if (!sectionId) {
      setError("Select a section.");
      return;
    }
    if (!name.trim()) {
      setError("Enter a class name.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        academic_level_id: levelId,
        section_id: sectionId,
        specialization_id: specId || null,
        name: name.trim(),
        capacity: capacity.trim() ? Number(capacity) : null,
      };
      const err =
        editingClass && onUpdate
          ? await onUpdate({ id: editingClass.id, ...payload })
          : await onCreate(payload);
      if (err) {
        setError(err);
        return;
      }
      if (!editingClass) {
        setName("");
        setCapacity("");
        setTouchedName(false);
        if (suggestions[0]) setName(suggestions[0]);
      } else {
        onCancelEdit?.();
      }
    } finally {
      setBusy(false);
    }
  }

  if (activeLevels.length === 0 || activeSections.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Add at least one academic level and one section before building classes.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <li>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              1. Academic level <span className="text-red-500">*</span>
            </span>
            <select
              value={levelId}
              onChange={(e) => {
                setLevelId(e.target.value);
                setTouchedName(false);
              }}
              className={inputClass}
            >
              <option value="">Select level…</option>
              {activeLevels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </li>
        <li>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              2. Section <span className="text-red-500">*</span>
            </span>
            <select
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                setSpecId("");
                setTouchedName(false);
              }}
              className={inputClass}
            >
              <option value="">Select section…</option>
              {activeSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </li>
        <li>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              3. Specialization{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <select
              value={specId}
              onChange={(e) => {
                setSpecId(e.target.value);
                setTouchedName(false);
              }}
              disabled={!sectionId}
              className={inputClass}
            >
              <option value="">None</option>
              {sectionSpecs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.abbreviation ? ` (${s.abbreviation})` : ""}
                </option>
              ))}
            </select>
          </label>
        </li>
        <li>
          <FormField
            label="4. Class name"
            required
            value={name}
            onChange={(e) => {
              setTouchedName(true);
              setName(e.target.value);
            }}
            placeholder="e.g. Form 1A"
          />
        </li>
      </ol>

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs font-medium text-slate-400">
            Suggestions:
          </span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTouchedName(true);
                setName(s);
              }}
              className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                name === s
                  ? "border-(--sofia-primary) bg-(--sofia-primary)/10 text-(--sofia-primary)"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <div className="max-w-xs">
        <FormField
          label="Capacity"
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder="Optional"
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={handleSubmit}
          className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-(--sofia-primary-dark) disabled:opacity-60"
        >
          {busy ? "Saving…" : editingClass ? "Update Class" : "Create Class"}
        </button>
        {editingClass ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel edit
          </button>
        ) : null}
      </div>
    </div>
  );
}
