import React from "react";
import Link from "next/link";
import { Upload04Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { Icon } from "../../../components/ui/Icon";
import {
  DOCUMENT_TYPE_OPTIONS,
  fetchDocuments,
  type StudentDocumentDto,
} from "../../../lib/student-mgmt";

export default function StudentDocumentsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [rows, setRows] = React.useState<StudentDocumentDto[]>([]);
  const [typeFilter, setTypeFilter] = React.useState("");
  const [search, setSearch] = React.useState("");

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
    if (!search.trim()) return true;
    const q = search.toLowerCase();
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
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <label className="block text-xs font-medium text-slate-500">
            Type
            <select
              className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15"
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
          </label>
          <label className="block min-w-48 flex-1 text-xs font-medium text-slate-500">
            Search
            <input
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title or student"
            />
          </label>
        </div>
        <Link
          href="/students/documents/upload"
          className="inline-flex items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Icon icon={Upload04Icon} size={16} />
          Upload
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading documents…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No documents found.
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {d.title}
                    </td>
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
                      {DOCUMENT_TYPE_OPTIONS.find(
                        (o) => o.key === d.document_type,
                      )?.label ?? d.document_type}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {d.created_at?.slice(0, 10) || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
