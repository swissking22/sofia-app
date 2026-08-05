import React from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../../ui/Icon";
import { FormField } from "../index";
import { RowActions, SetupModal } from "../DataTable";
import type {
  StructureSection,
  StructureSpecialization,
} from "../../../lib/academic-structure";
import { EmptyState } from "./LevelCards";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

const textareaClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

interface SpecListProps {
  sections: StructureSection[];
  specializations: StructureSpecialization[];
  onCreate: (input: {
    section_id: string;
    name: string;
    abbreviation: string;
    description?: string | null;
  }) => Promise<string | null>;
  onUpdate: (input: {
    id: string;
    section_id: string;
    name: string;
    abbreviation: string;
    description?: string | null;
  }) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
}

export function SpecList({
  sections,
  specializations,
  onCreate,
  onUpdate,
  onDelete,
}: SpecListProps) {
  const [filterSectionId, setFilterSectionId] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StructureSpecialization | null>(
    null,
  );
  const [sectionId, setSectionId] = React.useState("");
  const [name, setName] = React.useState("");
  const [abbreviation, setAbbreviation] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [modalError, setModalError] = React.useState("");

  const filtered = specializations.filter((s) =>
    filterSectionId ? s.section_id === filterSectionId : true,
  );

  function openCreate() {
    setEditing(null);
    setSectionId(filterSectionId || sections[0]?.id || "");
    setName("");
    setAbbreviation("");
    setDescription("");
    setModalError("");
    setOpen(true);
  }

  function openEdit(spec: StructureSpecialization) {
    setEditing(spec);
    setSectionId(spec.section_id);
    setName(spec.name);
    setAbbreviation(spec.abbreviation);
    setDescription(spec.description ?? "");
    setModalError("");
    setOpen(true);
  }

  async function handleSave() {
    setModalError("");
    setBusy(true);
    try {
      const payload = {
        section_id: sectionId,
        name,
        abbreviation,
        description: description.trim() || null,
      };
      const err = editing
        ? await onUpdate({ id: editing.id, ...payload })
        : await onCreate(payload);
      if (err) {
        setModalError(err);
        return;
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (sections.length === 0) {
    return (
      <EmptyState message="Add at least one section before creating specializations." />
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="block w-full max-w-xs">
          <span className="sr-only">Filter by section</span>
          <select
            value={filterSectionId}
            onChange={(e) => setFilterSectionId(e.target.value)}
            className={inputClass}
          >
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-(--sofia-primary-dark)"
        >
          <Icon icon={Add01Icon} size={16} />
          Add Specialization
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No specializations yet. Optional — use them for streams like Electrical or Accounting." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Abbr</th>
                <th className="px-4 py-3">Section</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.map((spec) => {
                const section = sections.find((s) => s.id === spec.section_id);
                return (
                  <tr key={spec.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {spec.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">
                      {spec.abbreviation || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {section?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {spec.description || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <RowActions
                        onEdit={() => openEdit(spec)}
                        onDelete={() => {
                          void onDelete(spec.id);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SetupModal
        title={editing ? "Edit Specialization" : "Add Specialization"}
        open={open}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="cursor-pointer rounded-xl bg-(--sofia-primary) px-4 py-2 text-sm font-semibold text-white hover:bg-(--sofia-primary-dark) disabled:opacity-60"
            >
              {busy ? "Saving…" : editing ? "Save" : "Add"}
            </button>
          </>
        }
      >
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Section <span className="text-red-500">*</span>
          </span>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className={inputClass}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <FormField
          label="Specialization name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Electrical"
          fullWidth
        />
        <FormField
          label="Abbreviation"
          required
          value={abbreviation}
          onChange={(e) => setAbbreviation(e.target.value.toUpperCase())}
          placeholder="e.g. EL"
          hint="Used in class names (e.g. Form 1 EL A)"
          fullWidth
          maxLength={12}
        />
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Optional"
            className={textareaClass}
          />
        </label>
        {modalError ? (
          <p className="text-sm text-red-600">{modalError}</p>
        ) : null}
      </SetupModal>
    </>
  );
}
