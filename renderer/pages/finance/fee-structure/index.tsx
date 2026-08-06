import React from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import {
  ActionDrawer,
  ConfirmModal,
  EmptyRow,
  FilterBar,
  FinanceTable,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  fieldClass,
  selectClass,
} from "../../../components/finance/ui";
import { Icon } from "../../../components/ui/Icon";
import {
  FREQUENCY_LABELS,
  createStructure,
  deleteStructure,
  fetchFinanceMeta,
  fetchStructures,
  formatMoney,
  setStructureActive,
  type FeeFrequency,
  type FeeStructureDto,
  type FinanceMeta,
  type LateFeeMode,
} from "../../../lib/finance-mgmt";

type LineDraft = {
  key: string;
  fee_category_id: string;
  name: string;
  amount: string;
  frequency: FeeFrequency;
  is_mandatory: boolean;
  late_fee_mode: LateFeeMode;
  late_fee_value: string;
};

function emptyLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    fee_category_id: "",
    name: "",
    amount: "",
    frequency: "termly",
    is_mandatory: true,
    late_fee_mode: "none",
    late_fee_value: "0",
  };
}

export default function FeeStructurePage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<FinanceMeta | null>(null);
  const [rows, setRows] = React.useState<FeeStructureDto[]>([]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [yearId, setYearId] = React.useState("");
  const [termId, setTermId] = React.useState("");
  const [levelId, setLevelId] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<LineDraft[]>([emptyLine()]);

  const canManage = meta?.can_manage ?? false;
  const currency = meta?.currency ?? "";

  const termsForYear = (meta?.terms ?? []).filter(
    (t) => t.academic_year_id === yearId
  );
  const classesForLevel = (meta?.classes ?? []).filter(
    (c) => !levelId || c.academic_level_id === levelId
  );

  const load = React.useCallback(async () => {
    const [metaRes, listRes] = await Promise.all([
      fetchFinanceMeta(),
      fetchStructures(),
    ]);
    if (metaRes.ok) {
      setMeta(metaRes.data);
      setYearId((prev) => {
        if (prev) return prev;
        const current = metaRes.data.years.find((y) => y.is_current);
        return current?.id ?? metaRes.data.years[0]?.id ?? "";
      });
    }
    if (listRes.ok) setRows(listRes.data);
    else setError(listRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setName("");
    setTermId("");
    setLevelId("");
    setClassId("");
    setNotes("");
    setLines([emptyLine()]);
    const current = meta?.years.find((y) => y.is_current);
    setYearId(current?.id ?? meta?.years[0]?.id ?? "");
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.fee_category_id !== undefined) {
          const cat = meta?.categories.find(
            (c) => c.id === patch.fee_category_id
          );
          if (cat && !next.name.trim()) next.name = cat.name;
        }
        return next;
      })
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!name.trim() || !yearId) {
      setError("Name and academic year are required.");
      return;
    }
    const parsed = lines
      .map((l) => ({
        fee_category_id: l.fee_category_id || null,
        name: l.name.trim() ||
          meta?.categories.find((c) => c.id === l.fee_category_id)?.name ||
          "",
        amount: Number(l.amount),
        frequency: l.frequency,
        is_mandatory: l.is_mandatory,
        late_fee_mode: l.late_fee_mode,
        late_fee_value: Number(l.late_fee_value) || 0,
      }))
      .filter((l) => l.name && Number.isFinite(l.amount) && l.amount > 0);
    if (!parsed.length) {
      setError("Add at least one fee line with a positive amount.");
      return;
    }
    setBusy(true);
    try {
      const res = await createStructure({
        name: name.trim(),
        academic_year_id: yearId,
        academic_term_id: termId || null,
        academic_level_id: levelId || null,
        class_id: classId || null,
        notes: notes.trim() || null,
        lines: parsed,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Fee structure “${res.data.name}” created.`);
      setCreateOpen(false);
      resetForm();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: FeeStructureDto) {
    setError("");
    setBusy(true);
    try {
      const res = await setStructureActive({
        id: row.id,
        is_active: !row.is_active,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        row.is_active
          ? `“${row.name}” deactivated.`
          : `“${row.name}” activated.`
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setBusy(true);
    setError("");
    try {
      const res = await deleteStructure(deleteId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Fee structure deleted.");
      setDeleteId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Fee Structure"
      breadcrumb={["Finance & Fees", "Fee Structure"]}
      heading="Fee Structure"
      subtitle="Define tuition and fee packages by year, level, or class."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <FilterBar
        filters={<span className="text-sm text-slate-500">{rows.length} structures</span>}
        actions={
          canManage ? (
            <PrimaryButton
              onClick={() => {
                resetForm();
                setCreateOpen(true);
              }}
            >
              <Icon icon={Add01Icon} size={16} />
              New structure
            </PrimaryButton>
          ) : null
        }
      />

      <FinanceTable
        columns={[
          "Name",
          "Year",
          "Level / class",
          "Total",
          "Lines",
          "Status",
          "Actions",
        ]}
        loading={loading}
      >
        {rows.length === 0 ? (
          <EmptyRow colSpan={7} message="No fee structures yet." />
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium text-slate-900">
                {row.name}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {row.year_name ?? "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {[row.level_name, row.class_name].filter(Boolean).join(" · ") ||
                  "All"}
              </td>
              <td className="px-4 py-3 font-medium text-slate-800">
                {formatMoney(row.total, currency)}
              </td>
              <td className="px-4 py-3 text-slate-600">{row.lines.length}</td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={row.is_active ? "active" : "inactive"}
                  label={row.is_active ? "Active" : "Inactive"}
                />
              </td>
              <td className="px-4 py-3">
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton onClick={() => void toggleActive(row)}>
                      {row.is_active ? "Deactivate" : "Activate"}
                    </SecondaryButton>
                    <SecondaryButton onClick={() => setDeleteId(row.id)}>
                      Delete
                    </SecondaryButton>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">View only</span>
                )}
              </td>
            </tr>
          ))
        )}
      </FinanceTable>

      <ActionDrawer
        open={createOpen}
        title="New fee structure"
        subtitle="Add named fee lines with amounts and frequency."
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => setCreateOpen(false)}
              className="flex-1"
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form="fee-structure-form"
              disabled={busy}
              className="flex-1"
            >
              {busy ? "Saving…" : "Create"}
            </PrimaryButton>
          </div>
        }
      >
        <form id="fee-structure-form" onSubmit={handleCreate} className="space-y-4">
          <FormSection title="Details">
            <FormField label="Name" required>
              <input
                className={fieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </FormField>
            <FormField label="Academic year" required>
              <select
                className={selectClass}
                value={yearId}
                onChange={(e) => {
                  setYearId(e.target.value);
                  setTermId("");
                }}
                required
              >
                <option value="">Select year</option>
                {(meta?.years ?? []).map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Term (optional)">
              <select
                className={selectClass}
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              >
                <option value="">Any term</option>
                {termsForYear.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Level (optional)">
              <select
                className={selectClass}
                value={levelId}
                onChange={(e) => {
                  setLevelId(e.target.value);
                  setClassId("");
                }}
              >
                <option value="">All levels</option>
                {(meta?.levels ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Class (optional)">
              <select
                className={selectClass}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">All classes</option>
                {classesForLevel.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Notes">
              <textarea
                className={fieldClass}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </FormField>
          </FormSection>

          <FormSection title="Fee lines">
            <div className="space-y-4">
              {lines.map((line, idx) => (
                <div
                  key={line.key}
                  className="space-y-2 rounded-xl border border-slate-100 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      Line {idx + 1}
                    </span>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() =>
                          setLines((prev) =>
                            prev.filter((l) => l.key !== line.key)
                          )
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <FormField label="Category">
                    <select
                      className={selectClass}
                      value={line.fee_category_id}
                      onChange={(e) =>
                        updateLine(line.key, {
                          fee_category_id: e.target.value,
                        })
                      }
                    >
                      <option value="">Custom / other</option>
                      {(meta?.categories ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Name">
                    <input
                      className={fieldClass}
                      value={line.name}
                      onChange={(e) =>
                        updateLine(line.key, { name: e.target.value })
                      }
                      placeholder="Fee name"
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Amount">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={fieldClass}
                        value={line.amount}
                        onChange={(e) =>
                          updateLine(line.key, { amount: e.target.value })
                        }
                      />
                    </FormField>
                    <FormField label="Frequency">
                      <select
                        className={selectClass}
                        value={line.frequency}
                        onChange={(e) =>
                          updateLine(line.key, {
                            frequency: e.target.value as FeeFrequency,
                          })
                        }
                      >
                        {(
                          Object.keys(FREQUENCY_LABELS) as FeeFrequency[]
                        ).map((f) => (
                          <option key={f} value={f}>
                            {FREQUENCY_LABELS[f]}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={line.is_mandatory}
                      onChange={(e) =>
                        updateLine(line.key, {
                          is_mandatory: e.target.checked,
                        })
                      }
                    />
                    Mandatory
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Late fee">
                      <select
                        className={selectClass}
                        value={line.late_fee_mode}
                        onChange={(e) =>
                          updateLine(line.key, {
                            late_fee_mode: e.target.value as LateFeeMode,
                          })
                        }
                      >
                        <option value="none">None</option>
                        <option value="fixed">Fixed</option>
                        <option value="percent">Percent</option>
                      </select>
                    </FormField>
                    <FormField label="Late fee value">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={fieldClass}
                        disabled={line.late_fee_mode === "none"}
                        value={line.late_fee_value}
                        onChange={(e) =>
                          updateLine(line.key, {
                            late_fee_value: e.target.value,
                          })
                        }
                      />
                    </FormField>
                  </div>
                </div>
              ))}
              <SecondaryButton
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                Add line
              </SecondaryButton>
            </div>
          </FormSection>
        </form>
      </ActionDrawer>

      <ConfirmModal
        open={!!deleteId}
        title="Delete fee structure?"
        description="This soft-deletes the structure. Existing invoices are kept."
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </AppShell>
  );
}
