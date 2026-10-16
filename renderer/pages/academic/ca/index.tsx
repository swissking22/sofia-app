import React from "react";
import Link from "next/link";
import {
  Add01Icon,
  Delete02Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField } from "../../../components/setup";
import { Icon } from "../../../components/ui/Icon";
import {
  TableActionGroup,
  TableIconButton,
} from "../../../components/ui/TableActions";
import { ClientPaginatedTable } from "../../../components/ui/table-pagination";
import {
  deleteCaSequence,
  fetchAcademicMeta,
  fetchCaSequences,
  openCaSequence,
  updateCaSequence,
  type AcademicMeta,
  type CaSequenceDto,
  type CaSequenceStatus,
} from "../../../lib/academic-mgmt";
import { formatDisplayDate } from "../../../lib/date-format";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

function statusLabel(status: CaSequenceStatus) {
  if (status === "complete") return "Complete";
  if (status === "active") return "Active";
  return "Inactive";
}

function StatusBadge({ status }: { status: CaSequenceStatus }) {
  const styles: Record<CaSequenceStatus, string> = {
    inactive: "bg-slate-100 text-slate-600",
    active: "bg-amber-50 text-amber-800",
    complete: "bg-emerald-50 text-emerald-800",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export default function CaIndexPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [sequences, setSequences] = React.useState<CaSequenceDto[]>([]);
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [termFilter, setTermFilter] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<CaSequenceDto | null>(
    null,
  );
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState("Sequence 1");
  const [termId, setTermId] = React.useState("");
  const [maxScore, setMaxScore] = React.useState("20");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    const [listRes, metaRes] = await Promise.all([
      fetchCaSequences(),
      fetchAcademicMeta(),
    ]);
    if (listRes.ok) setSequences(listRes.data);
    else setError(listRes.error);
    if (metaRes.ok) {
      setMeta(metaRes.data);
      setTermId((prev) => prev || metaRes.data.terms[0]?.id || "");
    } else if (!listRes.ok) setError(metaRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = React.useMemo(() => {
    if (!termFilter) return sequences;
    return sequences.filter((s) => s.term_id === termFilter);
  }, [sequences, termFilter]);

  function resetForm() {
    setName("Sequence 1");
    setMaxScore("20");
    if (meta?.terms[0]) setTermId(meta.terms[0].id);
  }

  function openCreate() {
    setEditTarget(null);
    resetForm();
    setCreateOpen(true);
  }

  function openEdit(seq: CaSequenceDto) {
    setEditTarget(seq);
    setName(seq.name);
    setTermId(seq.term_id ?? "");
    setMaxScore(String(seq.max_score));
    setCreateOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!name.trim()) {
      setError("Enter a name (e.g. Sequence 1).");
      return;
    }
    if (!termId) {
      setError("Select the term.");
      return;
    }
    const maxNum = Number(maxScore);
    if (!maxNum || maxNum <= 0) {
      setError("Max score must be greater than zero.");
      return;
    }

    setSaving(true);
    try {
      if (editTarget) {
        if (!editTarget.term_id) {
          setError("This sequence has no term and cannot be edited.");
          return;
        }
        const res = await updateCaSequence({
          name: editTarget.name,
          term_id: editTarget.term_id,
          new_name: name.trim(),
          max_score: maxNum,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSuccess(
          `Updated “${res.data.name}” (${res.data.updated} sheet(s), max ${res.data.max_score}).`,
        );
      } else {
        const res = await openCaSequence({
          name: name.trim(),
          term_id: termId,
          max_score: maxNum,
          all_classes: true,
          skip_existing: true,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const termLabel =
          meta?.terms.find((t) => t.id === termId)?.name ?? "this term";
        setSuccess(
          `Created “${name.trim()}” for ${termLabel}: ${res.data.created} subject sheet(s) across ${res.data.class_count} class(es)` +
            (res.data.skipped
              ? ` (${res.data.skipped} already existed and were skipped).`
              : "."),
        );
      }
      setCreateOpen(false);
      setEditTarget(null);
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(seq: CaSequenceDto) {
    if (!seq.term_id) return;
    if (seq.status !== "inactive") return;
    const ok = window.confirm(
      `Delete “${seq.name}” for ${seq.term_name ?? "this term"}? This removes all empty score sheets. This cannot be undone.`,
    );
    if (!ok) return;
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const res = await deleteCaSequence({
        name: seq.name,
        term_id: seq.term_id,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Deleted “${seq.name}” (${res.data.deleted} sheet(s)).`);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const isEditing = Boolean(editTarget);

  return (
    <AppShell
      title="Continuous Assessment"
      breadcrumb={["Academic Management", "Continuous Assessment"]}
      heading="Continuous Assessment"
      subtitle="Create a sequence for the term, then Record marks — pick a class and subject, and enter scores."
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-(--sofia-primary) px-3.5 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          <Icon icon={Add01Icon} size={16} />
          Create sequence
        </button>
      }
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          className={selectClass}
          value={termFilter}
          onChange={(e) => setTermFilter(e.target.value)}
        >
          <option value="">All terms</option>
          {(meta?.terms ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <ClientPaginatedTable
          pageSize={25}
          head={
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Term</th>
                <th className="px-4 py-3 text-left">Date created</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Progress</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
          }
        >
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                No sequences yet. Click Create sequence to open Sequence 1 for
                the whole school.
              </td>
            </tr>
          ) : (
            filtered.map((s) => {
              const recordHref =
                s.term_id != null
                  ? `/academic/ca/record?name=${encodeURIComponent(s.name)}&term_id=${encodeURIComponent(s.term_id)}`
                  : null;
              const canMutate = s.status === "inactive" && Boolean(s.term_id);
              return (
                <tr
                  key={`${s.term_id ?? ""}:${s.name}`}
                  className="hover:bg-slate-50/80"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {s.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.term_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDisplayDate(s.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {s.scored_slots}/{s.expected_slots || "—"} marks
                    <span className="ml-1 text-slate-400">
                      ({s.class_count} classes)
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <TableActionGroup>
                      {recordHref ? (
                        <Link
                          href={recordHref}
                          className="inline-flex rounded-lg bg-(--sofia-primary) px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                        >
                          Record marks
                        </Link>
                      ) : null}
                      {canMutate ? (
                        <>
                          <TableIconButton
                            icon={PencilEdit01Icon}
                            label="Edit sequence"
                            tone="primary"
                            disabled={saving}
                            onClick={() => openEdit(s)}
                          />
                          <TableIconButton
                            icon={Delete02Icon}
                            label="Delete sequence"
                            tone="danger"
                            disabled={saving}
                            onClick={() => void handleDelete(s)}
                          />
                        </>
                      ) : null}
                    </TableActionGroup>
                  </td>
                </tr>
              );
            })
          )}
        </ClientPaginatedTable>
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              {isEditing ? "Edit sequence" : "Create sequence"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {isEditing ? (
                "Change the name or max score. Only sequences with no marks can be edited."
              ) : (
                <>
                  Name it and set the max mark. Sofia creates score sheets for{" "}
                  <strong>every subject in every class</strong> for this term.
                </>
              )}
            </p>

            <form
              onSubmit={(e) => void handleCreate(e)}
              className="mt-4 space-y-1"
            >
              <FormField
                label="Sequence name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sequence 1"
                fullWidth
                autoFocus
              />
              <label className="mb-4 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Term <span className="text-red-500">*</span>
                </span>
                <select
                  className={fieldClass}
                  value={termId}
                  onChange={(e) => setTermId(e.target.value)}
                  required
                  disabled={isEditing}
                >
                  <option value="">Select term…</option>
                  {(meta?.terms ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <FormField
                label="Max score"
                type="number"
                required
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                fullWidth
              />

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    setEditTarget(null);
                  }}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-(--sofia-primary) px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving
                    ? isEditing
                      ? "Saving…"
                      : "Creating…"
                    : isEditing
                      ? "Save changes"
                      : "Create for all classes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
