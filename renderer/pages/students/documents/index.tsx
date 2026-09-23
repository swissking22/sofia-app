import React from "react";
import Link from "next/link";
import { Upload04Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  StudentTable,
  TableSelectionBar,
  selectClass,
  useDebouncedValue,
} from "../../../components/students/ui";
import { Icon } from "../../../components/ui/Icon";
import { TableActionGroup, TableIconButton } from "../../../components/ui/TableActions";
import { formatDisplayDateTime } from "../../../lib/date-format";
import {
  DOCUMENT_TYPE_OPTIONS,
  downloadCsv,
  fetchDocuments,
  type StudentDocumentDto,
} from "../../../lib/student-mgmt";

function docTypeLabel(key: string): string {
  return (
    DOCUMENT_TYPE_OPTIONS.find((o) => o.key === key)?.label ?? key
  );
}

export default function StudentDocumentsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [rows, setRows] = React.useState<StudentDocumentDto[]>([]);
  const [typeFilter, setTypeFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchDocuments();
      if (res.ok) setRows(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) => {
    if (typeFilter && r.document_type !== typeFilter) return false;
    if (!debouncedSearch.trim()) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      (r.student_name || "").toLowerCase().includes(q)
    );
  });

  const [selected, setSelected] = React.useState<string[]>([]);

  const allSelected = filtered.length > 0 && selected.length === filtered.length;
  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelected([]);
    else setSelected(filtered.map((d) => d.id));
  }
  function exportSelected() {
    const target = filtered.filter((d) => selected.includes(d.id));
    if (!target.length) return;
    const csv = [
      ["Title", "Student", "Type", "Uploaded Date", "File URL"].join(","),
      ...target.map((d) =>
        [
          `"${d.title}"`,
          `"${d.student_name || ""}"`,
          `"${docTypeLabel(d.document_type)}"`,
          `"${formatDisplayDateTime(d.created_at, "")}"`,
          `"${d.file_url || ""}"`,
        ].join(","),
      ),
    ].join("\n");
    downloadCsv(`student-documents-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <AppShell
      title="Documents"
      breadcrumb={["Student Management", "Documents"]}
      heading="Student documents"
      subtitle="Birth certificates, report cards, and other student files."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

      <FilterBar
        filters={
          <>
            <FilterField label="Type">
              <select
                className={selectClass}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All types</option>
                {DOCUMENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Search" className="min-w-48 flex-1">
              <input
                className={selectClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title or student"
              />
            </FilterField>
          </>
        }
        actions={
          <PrimaryButton href="/students/documents/upload">
            <Icon icon={Upload04Icon} size={16} />
            Upload
          </PrimaryButton>
        }
      />

      <StudentTable
        columns={[
          <input
            key="select-all-header"
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = selected.length > 0 && !allSelected;
            }}
            onChange={toggleAll}
            aria-label="Select all"
          />,
          "Title",
          "Student",
          "Type",
          "Uploaded",
          "",
        ]}
        loading={loading}
      >
        {filtered.length === 0 ? (
          <EmptyRow colSpan={6}>No documents found.</EmptyRow>
        ) : (
          filtered.map((d) => (
            <tr key={d.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.includes(d.id)}
                  onChange={() => toggle(d.id)}
                />
              </td>
              <td className="px-4 py-3 font-medium text-slate-800">{d.title}</td>
              <td className="px-4 py-3">
                {d.student_id ? (
                  <Link
                    href={`/students/${d.student_id}`}
                    className="text-(--sofia-primary) hover:underline"
                  >
                    {d.student_name || "—"}
                  </Link>
                ) : (
                  d.student_name || "—"
                )}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {docTypeLabel(d.document_type)}
              </td>
              <td className="px-4 py-3 text-slate-500">
                {formatDisplayDateTime(d.created_at)}
              </td>
              <td className="px-4 py-3 text-right">
                {d.file_url ? (
                  <TableActionGroup>
                    <TableIconButton
                      icon={ViewIcon}
                      label="Open"
                      tone="primary"
                      href={d.file_url}
                      external
                    />
                  </TableActionGroup>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))
        )}
      </StudentTable>

      <TableSelectionBar
        totalCount={filtered.length}
        selectedCount={selected.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setSelected([])}
        actions={
          <button
            type="button"
            onClick={exportSelected}
            className="cursor-pointer rounded-lg bg-(--sofia-primary) px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
          >
            Export selected ({selected.length})
          </button>
        }
      />
    </AppShell>
  );
}
