import React from "react";
import { useRouter } from "next/router";
import { BanIcon, RefreshIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { IdCardModuleNav } from "../../../components/id-cards/ModuleNav";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  StatusBadge,
  StudentTable,
  TableSelectionBar,
  selectClass,
} from "../../../components/students/ui";
import {
  TableActionGroup,
  TableIconButton,
} from "../../../components/ui/TableActions";
import {
  fetchIdCardMeta,
  fetchIdCardTemplates,
  fetchIssuedIdCards,
  replaceIdCard,
  setIdCardStatus,
} from "../../../lib/student-id-cards";

export default function IssuedCardsPage() {
  const router = useRouter();
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [yearId, setYearId] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [meta, setMeta] = React.useState<
    | Extract<Awaited<ReturnType<typeof fetchIdCardMeta>>, { ok: true }>["data"]
    | null
  >(null);
  const [cards, setCards] = React.useState<
    Extract<
      Awaited<ReturnType<typeof fetchIssuedIdCards>>,
      { ok: true }
    >["data"]["cards"]
  >([]);
  const [picked, setPicked] = React.useState<Record<string, boolean>>({});

  const load = React.useCallback(async () => {
    const m = await fetchIdCardMeta();
    if (!m.ok) {
      setError(m.error);
      return;
    }
    setMeta(m.data);
    const y =
      yearId ||
      m.data.years.find((x) => x.is_current)?.id ||
      m.data.years[0]?.id ||
      "";
    if (!yearId && y) setYearId(y);
    const list = await fetchIssuedIdCards({
      academic_year_id: y || undefined,
      class_id: classId || undefined,
      status: status || undefined,
      search: search || undefined,
    });
    if (list.ok) setCards(list.data.cards);
    else setError(list.error);
  }, [yearId, classId, status, search]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const ids = Object.keys(picked).filter((k) => picked[k]);
  const allSelected = cards.length > 0 && ids.length === cards.length;

  function toggleAll() {
    if (allSelected) {
      setPicked({});
    } else {
      const next: Record<string, boolean> = {};
      for (const c of cards) next[c.id] = true;
      setPicked(next);
    }
  }

  async function bulkMarkIssued() {
    setError("");
    for (const id of ids) {
      const res = await setIdCardStatus(id, "issued");
      if (!res.ok) {
        setError(res.error);
        break;
      }
    }
    setPicked({});
    await load();
  }

  return (
    <AppShell
      title="Issued cards"
      breadcrumb={["Student Management", "ID Cards", "Issued"]}
      heading="Issued cards"
      subtitle="Historical cards stay on file. Replacements mark the old card as replaced — they are never deleted."
    >
      <IdCardModuleNav />
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}
      <FilterBar
        filters={
          <>
            <FilterField label="Year">
              <select
                className={selectClass}
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
              >
                {(meta?.years || []).map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Class">
              <select
                className={selectClass}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">All</option>
                {(meta?.classes || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Status">
              <select
                className={selectClass}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All</option>
                {[
                  "active",
                  "issued",
                  "generated",
                  "expired",
                  "revoked",
                  "replaced",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Search">
              <input
                className={selectClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </FilterField>
          </>
        }
        actions={
          <PrimaryButton
            disabled={!ids.length}
            onClick={() =>
              router.push(`/students/id-cards/print?ids=${ids.join(",")}`)
            }
          >
            Print selected
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
              if (el) el.indeterminate = ids.length > 0 && !allSelected;
            }}
            onChange={toggleAll}
            aria-label="Select all"
          />,
          "Student",
          "Card number",
          "Verify",
          "Status",
          "Issued",
          "Expires",
          "",
        ]}
      >
        {cards.length ? (
          cards.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={Boolean(picked[c.id])}
                  onChange={(e) =>
                    setPicked((cur) => ({ ...cur, [c.id]: e.target.checked }))
                  }
                />
              </td>
              <td className="px-4 py-3">
                <div className="font-medium">{c.student_name}</div>
                <div className="text-xs text-slate-400">
                  {c.student_code} · {c.class_name}
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-xs">{c.card_number}</td>
              <td className="px-4 py-3 font-mono text-xs">
                {c.verification_code}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={c.effective_status} />
              </td>
              <td className="px-4 py-3">{c.issue_date}</td>
              <td className="px-4 py-3">{c.expiry_date}</td>
              <td className="px-4 py-3 text-right">
                <TableActionGroup>
                  {meta?.can_issue ? (
                    <TableIconButton
                      icon={Tick02Icon}
                      label="Mark issued"
                      tone="primary"
                      onClick={() =>
                        void setIdCardStatus(c.id, "issued").then(load)
                      }
                    />
                  ) : null}
                  {meta?.can_replace && c.effective_status === "active" ? (
                    <TableIconButton
                      icon={RefreshIcon}
                      label="Replace"
                      onClick={async () => {
                        const templates = await fetchIdCardTemplates();
                        const templateId = templates.ok
                          ? templates.data.templates.find(
                              (t) => t.status === "active",
                            )?.id
                          : "";
                        if (!templateId) return;
                        const res = await replaceIdCard({
                          student_id: c.student_id,
                          academic_year_id: c.academic_year_id,
                          template_id: templateId,
                          reason: "lost",
                        });
                        if (!res.ok) setError(res.error);
                        else {
                          setSuccess("Replacement issued.");
                          await load();
                        }
                      }}
                    />
                  ) : null}
                  {meta?.can_revoke && c.effective_status !== "revoked" ? (
                    <TableIconButton
                      icon={BanIcon}
                      label="Revoke"
                      tone="danger"
                      onClick={async () => {
                        const res = await setIdCardStatus(c.id, "revoked");
                        if (!res.ok) setError(res.error);
                        else await load();
                      }}
                    />
                  ) : null}
                </TableActionGroup>
              </td>
            </tr>
          ))
        ) : (
          <EmptyRow colSpan={8}>No issued cards yet.</EmptyRow>
        )}
      </StudentTable>

      <TableSelectionBar
        totalCount={cards.length}
        selectedCount={ids.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setPicked({})}
        actions={
          <>
            <button
              type="button"
              onClick={() =>
                router.push(`/students/id-cards/print?ids=${ids.join(",")}`)
              }
              className="cursor-pointer rounded-lg bg-(--sofia-primary) px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
            >
              Print selected ({ids.length})
            </button>
            {meta?.can_issue ? (
              <button
                type="button"
                onClick={() => void bulkMarkIssued()}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Mark selected issued
              </button>
            ) : null}
          </>
        }
      />
    </AppShell>
  );
}
