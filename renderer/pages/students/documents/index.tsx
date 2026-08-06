import React from "react";
import Link from "next/link";
import { Upload04Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  StudentTable,
  selectClass,
  useDebouncedValue,
} from "../../../components/students/ui";
import { Icon } from "../../../components/ui/Icon";
import {
  DOCUMENT_TYPE_OPTIONS,
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
        columns={["Title", "Student", "Type", "Uploaded", ""]}
        loading={loading}
      >
        {filtered.length === 0 ? (
          <EmptyRow colSpan={5}>No documents found.</EmptyRow>
        ) : (
          filtered.map((d) => (
            <tr key={d.id} className="hover:bg-slate-50/80">
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
                {d.created_at?.slice(0, 10) || "—"}
              </td>
              <td className="px-4 py-3 text-right">
                {d.file_url ? (
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-(--sofia-primary) hover:underline"
                  >
                    Open
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))
        )}
      </StudentTable>
    </AppShell>
  );
}
