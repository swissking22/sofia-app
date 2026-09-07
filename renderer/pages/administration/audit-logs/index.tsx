import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  FormModal,
  PageAlert,
  StudentTable,
  TableSelectionBar,
  fieldClass,
  selectClass,
} from "../../../components/students/ui";
import { fetchAuditEvent, fetchAuditLogs } from "../../../lib/system-admin";

export default function AuditLogsPage() {
  const [error, setError] = React.useState("");
  const [events, setEvents] = React.useState<Array<Record<string, unknown>>>(
    [],
  );
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [query, setQuery] = React.useState("");
  const [moduleKey, setModuleKey] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [detail, setDetail] = React.useState<Record<string, unknown> | null>(
    null,
  );

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const allSelected =
    events.length > 0 && selectedIds.length === events.length;
  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(events.map((e) => String(e.id)));
  }
  function exportSelected() {
    const target = events.filter((e) => selectedIds.includes(String(e.id)));
    if (!target.length) return;
    const csv = [
      ["Date/Time", "User", "Action", "Module", "Entity", "Result"].join(","),
      ...target.map((e) =>
        [
          `"${String(e.created_at).replace("T", " ").slice(0, 19)}"`,
          `"${String(e.user_name || e.user_email || "—")}"`,
          `"${String(e.action)}"`,
          `"${String(e.module_key)}"`,
          `"${String(e.entity_id || "—")}"`,
          `"${String(e.result || "success")}"`,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const load = React.useCallback(async () => {
    const res = await fetchAuditLogs({
      query,
      module: moduleKey || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      page_size: 25,
    });
    if (res.ok) {
      setEvents(res.data.events);
      setTotal(res.data.total);
    } else setError(res.error);
  }, [query, moduleKey, from, to, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell
      title="Audit logs"
      breadcrumb={["System Administration", "Audit Logs"]}
      heading="Audit logs"
      subtitle="Append-only history. Administrators cannot edit or delete these events."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      <FilterBar
        filters={
          <>
            <FilterField label="Search">
              <input
                className={fieldClass}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </FilterField>
            <FilterField label="Module">
              <select
                className={selectClass}
                value={moduleKey}
                onChange={(e) => setModuleKey(e.target.value)}
              >
                <option value="">All</option>
                <option value="Authentication">Authentication</option>
                <option value="Users">Users</option>
                <option value="Finance">Finance</option>
                <option value="Documents">Documents</option>
                <option value="System">System</option>
              </select>
            </FilterField>
            <FilterField label="From">
              <input
                type="date"
                className={fieldClass}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </FilterField>
            <FilterField label="To">
              <input
                type="date"
                className={fieldClass}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </FilterField>
          </>
        }
      />
      <StudentTable
        columns={[
          <input
            key="select-all"
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el)
                el.indeterminate = selectedIds.length > 0 && !allSelected;
            }}
            onChange={toggleAll}
            aria-label="Select all"
          />,
          "Date/time",
          "User",
          "Action",
          "Module",
          "Entity",
          "Result",
        ]}
      >
        {events.length === 0 ? (
          <EmptyRow colSpan={7} message="No audit events for these filters." />
        ) : (
          events.map((e) => (
            <tr
              key={String(e.id)}
              className="hover:bg-slate-50"
            >
              <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(String(e.id))}
                  onChange={() => toggleRow(String(e.id))}
                />
              </td>
              <td
                className="cursor-pointer px-4 py-3 text-xs"
                onClick={() =>
                  void fetchAuditEvent(String(e.id)).then(
                    (r) => r.ok && setDetail(r.data.event),
                  )
                }
              >
                {String(e.created_at).replace("T", " ").slice(0, 19)}
              </td>
              <td
                className="cursor-pointer px-4 py-3 text-sm"
                onClick={() =>
                  void fetchAuditEvent(String(e.id)).then(
                    (r) => r.ok && setDetail(r.data.event),
                  )
                }
              >
                {String(e.user_name || e.user_email || "—")}
              </td>
              <td
                className="cursor-pointer px-4 py-3"
                onClick={() =>
                  void fetchAuditEvent(String(e.id)).then(
                    (r) => r.ok && setDetail(r.data.event),
                  )
                }
              >
                {String(e.action)}
              </td>
              <td
                className="cursor-pointer px-4 py-3"
                onClick={() =>
                  void fetchAuditEvent(String(e.id)).then(
                    (r) => r.ok && setDetail(r.data.event),
                  )
                }
              >
                {String(e.module_key)}
              </td>
              <td
                className="cursor-pointer px-4 py-3 font-mono text-xs"
                onClick={() =>
                  void fetchAuditEvent(String(e.id)).then(
                    (r) => r.ok && setDetail(r.data.event),
                  )
                }
              >
                {String(e.entity_id || "—")}
              </td>
              <td
                className="cursor-pointer px-4 py-3"
                onClick={() =>
                  void fetchAuditEvent(String(e.id)).then(
                    (r) => r.ok && setDetail(r.data.event),
                  )
                }
              >
                {String(e.result || "success")}
              </td>
            </tr>
          ))
        )}
      </StudentTable>

      <TableSelectionBar
        totalCount={events.length}
        selectedCount={selectedIds.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setSelectedIds([])}
        actions={
          <button
            type="button"
            onClick={exportSelected}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export selected ({selectedIds.length})
          </button>
        }
      />
      <p className="mt-2 text-xs text-slate-500">{total} event(s)</p>
      {total > page * 25 ? (
        <button
          type="button"
          className="mt-2 text-sm text-(--sofia-primary)"
          onClick={() => setPage((p) => p + 1)}
        >
          Next page
        </button>
      ) : null}
      <FormModal
        open={Boolean(detail)}
        title="Audit event"
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <dl className="space-y-2 text-sm">
            {[
              "created_at",
              "action",
              "module_key",
              "entity_type",
              "entity_id",
              "result",
              "description",
            ].map((k) => (
              <div key={k}>
                <dt className="text-xs uppercase text-slate-400">{k}</dt>
                <dd>{String(detail[k] ?? "—")}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs uppercase text-slate-400">Before</dt>
              <dd className="whitespace-pre-wrap font-mono text-xs">
                {JSON.stringify(detail.before_json || detail.before, null, 2)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">After</dt>
              <dd className="whitespace-pre-wrap font-mono text-xs">
                {JSON.stringify(detail.after_json || detail.after, null, 2)}
              </dd>
            </div>
          </dl>
        ) : null}
      </FormModal>
    </AppShell>
  );
}
