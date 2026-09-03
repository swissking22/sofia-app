import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  FormModal,
  PageAlert,
  StudentTable,
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
        columns={["Date/time", "User", "Action", "Module", "Entity", "Result"]}
      >
        {events.length === 0 ? (
          <EmptyRow colSpan={6} message="No audit events for these filters." />
        ) : (
          events.map((e) => (
            <tr
              key={String(e.id)}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() =>
                void fetchAuditEvent(String(e.id)).then(
                  (r) => r.ok && setDetail(r.data.event),
                )
              }
            >
              <td className="px-4 py-3 text-xs">
                {String(e.created_at).replace("T", " ").slice(0, 19)}
              </td>
              <td className="px-4 py-3 text-sm">
                {String(e.user_name || e.user_email || "—")}
              </td>
              <td className="px-4 py-3">{String(e.action)}</td>
              <td className="px-4 py-3">{String(e.module_key)}</td>
              <td className="px-4 py-3 font-mono text-xs">
                {String(e.entity_id || "—")}
              </td>
              <td className="px-4 py-3">{String(e.result || "success")}</td>
            </tr>
          ))
        )}
      </StudentTable>
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
