import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { File01Icon, PrinterIcon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../components/layout/AppShell";
import {
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  selectClass,
} from "../../components/students/ui";
import { Icon } from "../../components/ui/Icon";
import {
  CLASS_LIST_OPTIONAL_COLUMNS,
  DEFAULT_CLASS_LIST_OPTIONAL_COLUMNS,
  classListCellValue,
  classListColumnHeader,
  classListDocumentTitle,
  classListFilename,
  classListsToCsv,
  normalizeClassListColumns,
  type ClassListOptionalColumn,
} from "../../lib/class-list";
import {
  downloadCsv,
  fetchClassList,
  fetchStudentList,
  type ClassListDto,
} from "../../lib/student-mgmt";

const ALL_CLASSES = "all";
const COLUMNS_STORAGE_KEY = "sofia.class-list.columns";

function loadStoredColumns(): ClassListOptionalColumn[] {
  if (typeof window === "undefined") return DEFAULT_CLASS_LIST_OPTIONAL_COLUMNS;
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) return DEFAULT_CLASS_LIST_OPTIONAL_COLUMNS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_CLASS_LIST_OPTIONAL_COLUMNS;
    return normalizeClassListColumns(
      parsed.filter((v): v is ClassListOptionalColumn => typeof v === "string"),
    );
  } catch {
    return DEFAULT_CLASS_LIST_OPTIONAL_COLUMNS;
  }
}

function schoolLines(school: ClassListDto["school"]): string[] {
  const lines: string[] = [];
  if (school.address?.trim()) lines.push(school.address.trim());
  const contact = [school.phone, school.email].filter(Boolean).join(" · ");
  if (contact) lines.push(contact);
  const place = [school.region, school.division].filter(Boolean).join(" / ");
  if (place) lines.push(place);
  if (school.school_code?.trim()) {
    lines.push(`School code: ${school.school_code.trim()}`);
  }
  return lines;
}

function colWidthClass(key: ClassListOptionalColumn): string {
  switch (key) {
    case "sex":
    case "age":
      return "class-list-col-narrow";
    case "blank":
      return "class-list-col-blank";
    case "student_code":
    case "date_of_birth":
      return "class-list-col-mid";
    case "guardian_phone":
    case "residence":
      return "class-list-col-mid";
    default:
      return "class-list-col-wide";
  }
}

function ClassListSheet({
  list,
  group,
  columns,
}: {
  list: ClassListDto;
  group: ClassListDto["groups"][number];
  columns: ClassListOptionalColumn[];
}) {
  const className = group.class?.name ?? "Selected students";
  const lines = schoolLines(list.school);
  const colCount = 2 + columns.length;

  return (
    <section className="class-list-sheet">
      <table className="class-list-table w-full border-collapse text-sm">
        <colgroup>
          <col className="class-list-col-index" />
          <col className="class-list-col-name" />
          {columns.map((key) => (
            <col key={key} className={colWidthClass(key)} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <td colSpan={colCount} className="border-0 p-0">
              <header className="class-list-letterhead border-b-2 border-slate-900 pb-4 text-center">
                {list.school.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={list.school.logo_url}
                    alt=""
                    className="mx-auto mb-3 h-20 w-20 object-contain"
                  />
                ) : null}
                <p className="text-lg font-bold uppercase tracking-wide text-slate-900">
                  {list.school.name}
                </p>
                {lines.map((line) => (
                  <p key={line} className="mt-0.5 text-xs text-slate-600">
                    {line}
                  </p>
                ))}
                <h2 className="mt-4 text-base font-bold uppercase tracking-[0.12em] text-slate-900">
                  Class list
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {className}
                </p>
                {list.academic_year ? (
                  <p className="mt-0.5 text-xs text-slate-600">
                    Academic year {list.academic_year.name}
                  </p>
                ) : null}
              </header>
            </td>
          </tr>
          <tr>
            <th className="border border-slate-800 bg-slate-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide">
              Index
            </th>
            <th className="border border-slate-800 bg-slate-50 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide">
              Name
            </th>
            {columns.map((key) => (
              <th
                key={key}
                className={`border border-slate-800 bg-slate-50 px-2 py-2 text-xs font-semibold uppercase tracking-wide ${
                  key === "blank" || key === "sex" || key === "age"
                    ? "text-center"
                    : "text-left"
                }`}
              >
                {classListColumnHeader(key) || "\u00a0"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.students.length === 0 ? (
            <tr>
              <td
                colSpan={colCount}
                className="border border-slate-800 px-3 py-8 text-center text-slate-500"
              >
                No active students in this class.{" "}
                <Link
                  href="/students/create"
                  className="font-semibold text-(--sofia-primary) print:hidden"
                >
                  Add a student
                </Link>
              </td>
            </tr>
          ) : (
            group.students.map((s, i) => (
              <tr key={s.id}>
                <td className="border border-slate-800 px-2 py-1.5 text-center tabular-nums">
                  {i + 1}
                </td>
                <td className="class-list-name border border-slate-800 px-3 py-1.5 leading-snug">
                  {s.name}
                </td>
                {columns.map((key) => {
                  const value = classListCellValue(s, key);
                  const centered =
                    key === "blank" || key === "sex" || key === "age";
                  return (
                    <td
                      key={key}
                      className={`border border-slate-800 px-2 py-1.5 ${
                        centered ? "text-center" : "text-left"
                      }`}
                    >
                      {value || (key === "blank" ? "" : "—")}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-4 text-right text-[11px] text-slate-500">
        {group.students.length} student
        {group.students.length === 1 ? "" : "s"}
      </p>
    </section>
  );
}

export default function ClassListsPage() {
  const router = useRouter();
  const queryClass =
    typeof router.query.class_id === "string" ? router.query.class_id : "";
  const queryIds = React.useMemo(() => {
    const raw = router.query.ids;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return (value ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }, [router.query.ids]);

  const [loadingMeta, setLoadingMeta] = React.useState(true);
  const [loadingList, setLoadingList] = React.useState(false);
  const [error, setError] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [classes, setClasses] = React.useState<
    Array<{
      id: string;
      name: string;
      academic_level_id: string | null;
      section_id: string | null;
    }>
  >([]);
  const [list, setList] = React.useState<ClassListDto | null>(null);
  const [columns, setColumns] = React.useState<ClassListOptionalColumn[]>(
    DEFAULT_CLASS_LIST_OPTIONAL_COLUMNS,
  );

  React.useEffect(() => {
    setColumns(loadStoredColumns());
  }, []);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchStudentList({ status: "active" });
      if (res.ok) setClasses(res.data.filters.classes ?? []);
      else setError(res.error);
      setLoadingMeta(false);
    })();
  }, []);

  React.useEffect(() => {
    if (!router.isReady) return;
    if (queryClass) setClassId(queryClass);
  }, [router.isReady, queryClass]);

  const loadList = React.useCallback(
    async (nextClassId: string, ids: string[]) => {
      if (!nextClassId && ids.length === 0) {
        setList(null);
        return;
      }
      setLoadingList(true);
      setError("");
      const res = await fetchClassList({
        class_id: nextClassId || null,
        student_ids: ids.length ? ids : undefined,
      });
      if (res.ok) setList(res.data);
      else {
        setList(null);
        setError(res.error);
      }
      setLoadingList(false);
    },
    [],
  );

  React.useEffect(() => {
    if (!router.isReady) return;
    if (queryIds.length) {
      void loadList(queryClass || classId, queryIds);
      return;
    }
    if (classId) void loadList(classId, []);
    else setList(null);
  }, [router.isReady, classId, queryClass, queryIds, loadList]);

  function toggleColumn(key: ClassListOptionalColumn) {
    setColumns((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [
            ...CLASS_LIST_OPTIONAL_COLUMNS.map((c) => c.key).filter(
              (k) => prev.includes(k) || k === key,
            ),
          ];
      const normalized = normalizeClassListColumns(next);
      try {
        window.localStorage.setItem(
          COLUMNS_STORAGE_KEY,
          JSON.stringify(normalized),
        );
      } catch {
        /* ignore */
      }
      return normalized;
    });
  }

  const groups = list?.groups?.length
    ? list.groups
    : list
      ? [{ class: list.class, students: list.students }]
      : [];
  const allClasses = classId === ALL_CLASSES || Boolean(list?.all_classes);
  const classNameForFile = allClasses
    ? "All classes"
    : list?.class?.name?.trim() ||
      (groups.length === 1 ? groups[0].class?.name?.trim() : null) ||
      null;

  function exportCsv() {
    if (!groups.some((g) => g.students.length)) return;
    downloadCsv(
      classListFilename(classNameForFile),
      classListsToCsv(
        groups.map((g) => ({
          class_name: g.class?.name ?? "Unassigned",
          students: g.students,
        })),
        columns,
      ),
    );
  }

  const showActions = Boolean(list && !loadingList);
  const hasRows = groups.some((g) => g.students.length > 0);

  return (
    <AppShell
      title={
        classNameForFile
          ? classListDocumentTitle(classNameForFile)
          : "Class lists"
      }
      breadcrumb={["Student Management", "Class Lists"]}
      heading="Class lists"
      subtitle="Select a class — or all classes — choose columns, then print an A4 class list or export CSV."
    >
      {error ? (
        <div className="print:hidden">
          <PageAlert tone="error">{error}</PageAlert>
        </div>
      ) : null}

      <div className="print:hidden">
        <FilterBar
          filters={
            <>
              <FilterField label="Class">
                <select
                  className={`min-w-52 ${selectClass}`}
                  value={classId}
                  disabled={loadingMeta}
                  onChange={(e) => {
                    const next = e.target.value;
                    setClassId(next);
                    void router.replace(
                      next
                        ? {
                            pathname: "/students/class-lists",
                            query: { class_id: next },
                          }
                        : { pathname: "/students/class-lists" },
                      undefined,
                      { shallow: true },
                    );
                  }}
                >
                  <option value="">Select a class…</option>
                  <option value={ALL_CLASSES}>All classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FilterField>
              {queryIds.length ? (
                <p className="self-end pb-2 text-xs text-slate-500">
                  Showing {queryIds.length} selected student
                  {queryIds.length === 1 ? "" : "s"}.
                </p>
              ) : null}
            </>
          }
          actions={
            showActions ? (
              <>
                <SecondaryButton disabled={!hasRows} onClick={exportCsv}>
                  <Icon icon={File01Icon} size={16} />
                  Export CSV
                </SecondaryButton>
                <PrimaryButton
                  disabled={!hasRows}
                  onClick={() => window.print()}
                >
                  <Icon icon={PrinterIcon} size={16} />
                  Print / Save PDF
                </PrimaryButton>
              </>
            ) : null
          }
        />

        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Columns
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Index and full name are always included. Choose extra columns for
            print and CSV.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" checked disabled className="rounded" />
              Index
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" checked disabled className="rounded" />
              Full name
            </label>
            {CLASS_LIST_OPTIONAL_COLUMNS.map((col) => (
              <label
                key={col.key}
                className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-(--sofia-primary) focus:ring-(--sofia-primary)"
                  checked={columns.includes(col.key)}
                  onChange={() => toggleColumn(col.key)}
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {loadingMeta || loadingList ? (
        <p className="text-sm text-slate-500 print:hidden">
          Loading class list…
        </p>
      ) : !classId && !queryIds.length ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500 print:hidden">
          Choose a class, or All classes, to generate lists.
        </p>
      ) : !list ? (
        <p className="text-sm text-slate-500 print:hidden">
          No class list to show.
        </p>
      ) : (
        <div className="class-list-doc mx-auto mt-4 bg-white px-10 py-8 shadow-sm print:mx-0 print:mt-0 print:max-w-none print:px-0 print:py-0 print:shadow-none">
          {groups.map((group, index) => (
            <ClassListSheet
              key={group.class?.id ?? `group-${index}`}
              list={list}
              group={group}
              columns={columns}
            />
          ))}
        </div>
      )}

      <style jsx global>{`
        .class-list-table {
          table-layout: auto;
          width: 100%;
        }
        .class-list-col-index {
          width: 1%;
          white-space: nowrap;
        }
        .class-list-col-name {
          width: 1%;
          white-space: nowrap;
        }
        .class-list-col-narrow {
          width: 1%;
          white-space: nowrap;
        }
        .class-list-col-mid {
          width: 1%;
          white-space: nowrap;
        }
        .class-list-col-wide {
          width: 1%;
          white-space: nowrap;
        }
        .class-list-col-blank {
          width: 99%;
        }
        .class-list-name {
          white-space: nowrap;
        }
        .class-list-table thead {
          display: table-header-group;
        }
        @page {
          size: A4;
          margin: 14mm;
        }
        @media print {
          html,
          body,
          #__next {
            background: white !important;
            height: auto !important;
            overflow: visible !important;
          }
          .class-list-doc {
            max-width: none !important;
            box-shadow: none !important;
          }
          .class-list-sheet {
            break-after: page;
            page-break-after: always;
          }
          .class-list-sheet:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .class-list-table thead {
            display: table-header-group;
          }
          .class-list-letterhead {
            break-inside: avoid;
          }
        }
      `}</style>
    </AppShell>
  );
}
