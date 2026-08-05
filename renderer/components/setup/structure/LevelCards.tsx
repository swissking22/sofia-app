import React from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../../ui/Icon";
import { FormField } from "../index";
import { RowActions, SetupModal } from "../DataTable";
import type {
  LevelCategory,
  StructureLevel,
} from "../../../lib/academic-structure";

const CATEGORY_LABEL: Record<LevelCategory, string> = {
  lower_secondary: "Lower Secondary",
  upper_secondary: "Upper Secondary",
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

interface LevelCardsProps {
  levels: StructureLevel[];
  onCreate: (input: {
    name: string;
    category: LevelCategory;
  }) => Promise<string | null>;
  onUpdate: (input: {
    id: string;
    name: string;
    category: LevelCategory;
  }) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
}

export function LevelCards({
  levels,
  onCreate,
  onUpdate,
  onDelete,
}: LevelCardsProps) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StructureLevel | null>(null);
  const [name, setName] = React.useState("");
  const [category, setCategory] =
    React.useState<LevelCategory>("lower_secondary");
  const [busy, setBusy] = React.useState(false);
  const [modalError, setModalError] = React.useState("");

  function openCreate() {
    setEditing(null);
    setName("");
    setCategory("lower_secondary");
    setModalError("");
    setOpen(true);
  }

  function openEdit(level: StructureLevel) {
    setEditing(level);
    setName(level.name);
    setCategory(level.category);
    setModalError("");
    setOpen(true);
  }

  async function handleSave() {
    setModalError("");
    setBusy(true);
    try {
      const err = editing
        ? await onUpdate({ id: editing.id, name, category })
        : await onCreate({ name, category });
      if (err) {
        setModalError(err);
        return;
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const lower = levels.filter((l) => l.category === "lower_secondary");
  const upper = levels.filter((l) => l.category === "upper_secondary");

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {levels.length} level{levels.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-(--sofia-primary-dark)"
        >
          <Icon icon={Add01Icon} size={16} />
          Add Level
        </button>
      </div>

      {levels.length === 0 ? (
        <EmptyState message="No academic levels yet. Add Form 1–5 or Sixth Form levels to get started." />
      ) : (
        <div className="space-y-5">
          <LevelGroup
            title="Lower Secondary"
            levels={lower}
            onEdit={openEdit}
            onDelete={onDelete}
          />
          <LevelGroup
            title="Upper Secondary"
            levels={upper}
            onEdit={openEdit}
            onDelete={onDelete}
          />
        </div>
      )}

      <SetupModal
        title={editing ? "Edit Level" : "Add Level"}
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
              {busy ? "Saving…" : editing ? "Save" : "Add Level"}
            </button>
          </>
        }
      >
        <FormField
          label="Level name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Form 1"
          fullWidth
        />
        <label className="mb-4 block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Category <span className="text-red-500">*</span>
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as LevelCategory)}
            className={inputClass}
          >
            <option value="lower_secondary">Lower Secondary</option>
            <option value="upper_secondary">Upper Secondary</option>
          </select>
        </label>
        {modalError ? (
          <p className="text-sm text-red-600">{modalError}</p>
        ) : null}
      </SetupModal>
    </>
  );
}

function LevelGroup({
  title,
  levels,
  onEdit,
  onDelete,
}: {
  title: string;
  levels: StructureLevel[];
  onEdit: (level: StructureLevel) => void;
  onDelete: (id: string) => Promise<string | null>;
}) {
  if (levels.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {levels.map((level) => (
          <div
            key={level.id}
            className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{level.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {CATEGORY_LABEL[level.category]} · {level.class_count} class
                  {level.class_count === 1 ? "" : "es"}
                </p>
              </div>
              <RowActions
                onEdit={() => onEdit(level)}
                onDelete={() => {
                  void onDelete(level.id);
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}
