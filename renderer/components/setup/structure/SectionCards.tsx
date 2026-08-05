import React from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../../ui/Icon";
import { FormField } from "../index";
import { RowActions, SetupModal } from "../DataTable";
import type { StructureSection } from "../../../lib/academic-structure";
import { EmptyState } from "./LevelCards";

const textareaClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

interface SectionCardsProps {
  sections: StructureSection[];
  onCreate: (input: {
    name: string;
    description?: string | null;
  }) => Promise<string | null>;
  onUpdate: (input: {
    id: string;
    name: string;
    description?: string | null;
  }) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
}

export function SectionCards({
  sections,
  onCreate,
  onUpdate,
  onDelete,
}: SectionCardsProps) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StructureSection | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [modalError, setModalError] = React.useState("");

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setModalError("");
    setOpen(true);
  }

  function openEdit(section: StructureSection) {
    setEditing(section);
    setName(section.name);
    setDescription(section.description ?? "");
    setModalError("");
    setOpen(true);
  }

  async function handleSave() {
    setModalError("");
    setBusy(true);
    try {
      const payload = {
        name,
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

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {sections.length} section{sections.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-(--sofia-primary-dark)"
        >
          <Icon icon={Add01Icon} size={16} />
          Add Section
        </button>
      </div>

      {sections.length === 0 ? (
        <EmptyState message="No sections yet. Add General, Commercial, Technical, or your own." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <div
              key={section.id}
              className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{section.name}</p>
                  {section.description ? (
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {section.description}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-500">
                    {section.class_count} class
                    {section.class_count === 1 ? "" : "es"} ·{" "}
                    {section.specialization_count} specialization
                    {section.specialization_count === 1 ? "" : "s"}
                  </p>
                </div>
                <RowActions
                  onEdit={() => openEdit(section)}
                  onDelete={() => {
                    void onDelete(section.id);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <SetupModal
        title={editing ? "Edit Section" : "Add Section"}
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
              {busy ? "Saving…" : editing ? "Save" : "Add Section"}
            </button>
          </>
        }
      >
        <FormField
          label="Section name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Technical"
          fullWidth
        />
        <label className="mb-4 block sm:col-span-2">
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
