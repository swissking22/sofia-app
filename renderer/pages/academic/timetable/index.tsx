import React from "react";
import Link from "next/link";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { Icon } from "../../../components/ui/Icon";
import {
  clearTimetableSlot,
  fetchAcademicMeta,
  fetchTimetable,
  type AcademicMeta,
  type TimetableSlotDto,
} from "../../../lib/academic-mgmt";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

type ViewMode = "class" | "teacher";

function slotKey(day: number, period: number) {
  return `${day}-${period}`;
}

export default function TimetableIndexPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [slots, setSlots] = React.useState<TimetableSlotDto[]>([]);
  const [view, setView] = React.useState<ViewMode>("class");
  const [classId, setClassId] = React.useState("");
  const [staffId, setStaffId] = React.useState("");

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAcademicMeta();
      if (res.ok) {
        setMeta(res.data);
        if (res.data.classes.length) {
          setClassId(res.data.classes[0].id);
        }
        if (res.data.teachers.length) {
          setStaffId(res.data.teachers[0].id);
        }
      } else {
        setError(res.error);
      }
    })();
  }, []);

  const loadTimetable = React.useCallback(async () => {
    if (!meta) return;
    setLoading(true);
    setError("");
    const input =
      view === "class"
        ? { view: "class" as const, class_id: classId || undefined }
        : { view: "teacher" as const, staff_id: staffId || undefined };
    const res = await fetchTimetable(input);
    if (res.ok) setSlots(res.data.slots);
    else setError(res.error);
    setLoading(false);
  }, [meta, view, classId, staffId]);

  React.useEffect(() => {
    if (!meta) return;
    if (view === "class" && !classId) return;
    if (view === "teacher" && !staffId) return;
    void loadTimetable();
  }, [meta, view, classId, staffId, loadTimetable]);

  const slotMap = React.useMemo(() => {
    const map = new Map<string, TimetableSlotDto>();
    for (const slot of slots) {
      map.set(slotKey(slot.day_of_week, slot.period_number), slot);
    }
    return map;
  }, [slots]);

  async function handleClearSlot(day: number, period: number) {
    const activeClassId = view === "class" ? classId : slotMap.get(slotKey(day, period))?.class_id;
    if (!activeClassId) return;
    const slot = slotMap.get(slotKey(day, period));
    if (!slot?.subject_id) return;
    if (!window.confirm("Clear this timetable slot?")) return;
    setError("");
    setSuccess("");
    const res = await clearTimetableSlot({
      class_id: activeClassId,
      day_of_week: day,
      period_number: period,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess("Slot cleared.");
    await loadTimetable();
  }

  const periods = meta?.periods ?? 8;
  const days = meta?.days ?? [];
  const editClassId = view === "class" ? classId : "";

  return (
    <AppShell
      title="Timetable"
      breadcrumb={["Academic Management", "Timetable"]}
      heading="Timetable"
      subtitle="Weekly schedule by class or teacher."
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

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setView("class")}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition ${
                view === "class"
                  ? "bg-(--sofia-primary) text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Class
            </button>
            <button
              type="button"
              onClick={() => setView("teacher")}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition ${
                view === "teacher"
                  ? "bg-(--sofia-primary) text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Teacher
            </button>
          </div>

          {view === "class" ? (
            <label className="block text-xs font-medium text-slate-500">
              Class
              <select
                className={`mt-1 block min-w-40 ${selectClass}`}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">Select class…</option>
                {(meta?.classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-xs font-medium text-slate-500">
              Teacher
              <select
                className={`mt-1 block min-w-48 ${selectClass}`}
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
              >
                <option value="">Select teacher…</option>
                {(meta?.teachers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {view === "class" && classId ? (
            <Link
              href={`/academic/timetable/create?class_id=${encodeURIComponent(classId)}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              Edit timetable
            </Link>
          ) : null}
          <Link
            href={
              editClassId
                ? `/academic/timetable/create?class_id=${encodeURIComponent(editClassId)}`
                : "/academic/timetable/create"
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Icon icon={Add01Icon} size={16} />
            Build timetable
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading timetable…</p>
      ) : !days.length ? (
        <p className="text-sm text-slate-500">No timetable days configured.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-20 px-3 py-3">Period</th>
                {days.map((d) => (
                  <th key={d.day} className="min-w-32 px-3 py-3">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from({ length: periods }, (_, i) => i + 1).map((period) => (
                <tr key={period}>
                  <td className="px-3 py-3 font-medium text-slate-500">
                    {period}
                  </td>
                  {days.map((d) => {
                    const slot = slotMap.get(slotKey(d.day, period));
                    const filled = Boolean(slot?.subject_name);
                    return (
                      <td
                        key={d.day}
                        className={`px-2 py-2 align-top ${
                          filled ? "cursor-pointer hover:bg-slate-50/80" : ""
                        }`}
                        title={filled ? "Double-click to clear" : undefined}
                        onDoubleClick={() =>
                          filled ? void handleClearSlot(d.day, period) : undefined
                        }
                      >
                        <div
                          className={`min-h-14 rounded-lg border px-2 py-1.5 ${
                            filled
                              ? "border-(--sofia-primary)/20 bg-(--sofia-primary)/5"
                              : "border-dashed border-slate-200 bg-slate-50/50"
                          }`}
                        >
                          {filled ? (
                            <>
                              <p className="text-xs font-semibold text-slate-800">
                                {slot?.subject_name}
                              </p>
                              {slot?.staff_name ? (
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {slot.staff_name}
                                </p>
                              ) : null}
                              {view === "teacher" && slot?.class_name ? (
                                <p className="mt-0.5 text-xs text-slate-400">
                                  {slot.class_name}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Double-click a filled cell to clear it. Use Build timetable to add or change slots.
      </p>
    </AppShell>
  );
}
