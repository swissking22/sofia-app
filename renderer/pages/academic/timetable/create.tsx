import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  clearTimetableSlot,
  fetchAcademicMeta,
  fetchTimetable,
  saveTimetableSlot,
  type AcademicMeta,
  type TimetableSlotDto,
} from "../../../lib/academic-mgmt";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

const DRAG_TYPE = "application/x-sofia-subject";

function slotKey(day: number, period: number) {
  return `${day}-${period}`;
}

export default function TimetableCreatePage() {
  const router = useRouter();
  const [meta, setMeta] = React.useState<AcademicMeta | null>(null);
  const [classId, setClassId] = React.useState("");
  const [defaultStaffId, setDefaultStaffId] = React.useState("");
  const [slots, setSlots] = React.useState<TimetableSlotDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [dragOver, setDragOver] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAcademicMeta();
      if (res.ok) {
        setMeta(res.data);
        const qClass =
          typeof router.query.class_id === "string" ? router.query.class_id : "";
        const initial =
          qClass && res.data.classes.some((c) => c.id === qClass)
            ? qClass
            : res.data.classes[0]?.id ?? "";
        setClassId(initial);
      } else {
        setError(res.error);
        setLoading(false);
      }
    })();
  }, [router.query.class_id]);

  const loadSlots = React.useCallback(async (cid: string) => {
    if (!cid) {
      setSlots([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetchTimetable({ class_id: cid });
    if (res.ok) setSlots(res.data.slots);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (!classId) return;
    void loadSlots(classId);
  }, [classId, loadSlots]);

  const classSubjects = React.useMemo(() => {
    if (!meta || !classId) return [];
    return meta.subjects.filter((s) => s.class_ids.includes(classId));
  }, [meta, classId]);

  const slotMap = React.useMemo(() => {
    const map = new Map<string, TimetableSlotDto>();
    for (const slot of slots) {
      map.set(slotKey(slot.day_of_week, slot.period_number), slot);
    }
    return map;
  }, [slots]);

  function handleDragStart(e: React.DragEvent, subjectId: string) {
    e.dataTransfer.setData(DRAG_TYPE, subjectId);
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleDragOverCell(e: React.DragEvent, key: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(key);
  }

  async function handleDrop(e: React.DragEvent, day: number, period: number) {
    e.preventDefault();
    setDragOver(null);
    if (!classId) return;
    const subjectId = e.dataTransfer.getData(DRAG_TYPE);
    if (!subjectId) return;

    setSaving(true);
    setError("");
    setSuccess("");
    const existing = slotMap.get(slotKey(day, period));
    const res = await saveTimetableSlot({
      id: existing?.id ?? null,
      class_id: classId,
      subject_id: subjectId,
      staff_id: defaultStaffId || existing?.staff_id || null,
      day_of_week: day,
      period_number: period,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const subject = classSubjects.find((s) => s.id === subjectId);
    setSuccess(
      `Saved ${subject?.name ?? "subject"} — Period ${period}, ${meta?.days.find((d) => d.day === day)?.label ?? `Day ${day}`}.`,
    );
    await loadSlots(classId);
  }

  async function handleClearCell(day: number, period: number) {
    if (!classId) return;
    const slot = slotMap.get(slotKey(day, period));
    if (!slot?.subject_id) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const res = await clearTimetableSlot({
      class_id: classId,
      day_of_week: day,
      period_number: period,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess("Slot cleared.");
    await loadSlots(classId);
  }

  const periods = meta?.periods ?? 8;
  const days = meta?.days ?? [];

  return (
    <AppShell
      title="Build timetable"
      breadcrumb={["Academic Management", "Timetable", "Build"]}
      heading="Build timetable"
      subtitle="Drag subjects onto the grid. Double-click a cell to clear it."
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

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block text-xs font-medium text-slate-500">
          Class
          <select
            className={`mt-1 block min-w-44 ${selectClass}`}
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSuccess("");
            }}
          >
            <option value="">Select class…</option>
            {(meta?.classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Default teacher
          <select
            className={`mt-1 block min-w-48 ${selectClass}`}
            value={defaultStaffId}
            onChange={(e) => setDefaultStaffId(e.target.value)}
          >
            <option value="">None (assign per slot later)</option>
            {(meta?.teachers ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
        </label>
        {saving ? (
          <span className="pb-2 text-sm text-slate-500">Saving…</span>
        ) : null}
      </div>

      {!classId ? (
        <p className="text-sm text-slate-500">Select a class to begin.</p>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 lg:w-56">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Subjects
            </h3>
            <p className="mt-1 mb-3 text-xs text-slate-400">
              Drag onto a period cell.
            </p>
            {classSubjects.length === 0 ? (
              <p className="text-sm text-slate-500">No subjects for this class.</p>
            ) : (
              <ul className="space-y-2">
                {classSubjects.map((s) => (
                  <li key={s.id}>
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, s.id)}
                      className="cursor-grab rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 active:cursor-grabbing hover:border-(--sofia-primary)/40 hover:bg-white"
                    >
                      {s.name}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <div className="min-w-0 flex-1">
            {loading ? (
              <p className="text-sm text-slate-500">Loading grid…</p>
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
                    {Array.from({ length: periods }, (_, i) => i + 1).map(
                      (period) => (
                        <tr key={period}>
                          <td className="px-3 py-3 font-medium text-slate-500">
                            {period}
                          </td>
                          {days.map((d) => {
                            const key = slotKey(d.day, period);
                            const slot = slotMap.get(key);
                            const isOver = dragOver === key;
                            return (
                              <td key={d.day} className="px-2 py-2 align-top">
                                <div
                                  onDragOver={(e) => handleDragOverCell(e, key)}
                                  onDragLeave={() => setDragOver(null)}
                                  onDrop={(e) => void handleDrop(e, d.day, period)}
                                  onDoubleClick={() =>
                                    void handleClearCell(d.day, period)
                                  }
                                  className={`min-h-16 rounded-lg border px-2 py-1.5 transition ${
                                    isOver
                                      ? "border-(--sofia-primary) bg-(--sofia-primary)/10 ring-2 ring-(--sofia-primary)/20"
                                      : slot?.subject_name
                                        ? "border-(--sofia-primary)/20 bg-(--sofia-primary)/5"
                                        : "border-dashed border-slate-200 bg-slate-50/50"
                                  }`}
                                  title="Drop subject here · double-click to clear"
                                >
                                  {slot?.subject_name ? (
                                    <>
                                      <p className="text-xs font-semibold text-slate-800">
                                        {slot.subject_name}
                                      </p>
                                      {slot.staff_name ? (
                                        <p className="mt-0.5 text-xs text-slate-500">
                                          {slot.staff_name}
                                        </p>
                                      ) : null}
                                    </>
                                  ) : (
                                    <span className="text-xs text-slate-300">
                                      Drop here
                                    </span>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-5">
        <Link
          href="/academic/timetable"
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
        >
          Back to timetable
        </Link>
      </div>
    </AppShell>
  );
}
