import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  fetchPromotionPreview,
  fetchStudentList,
  type PromotionPreview,
} from "../../../lib/student-mgmt";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function PromotionPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [years, setYears] = React.useState<number[]>([]);
  const [fromYear, setFromYear] = React.useState("");
  const [toYear, setToYear] = React.useState("");
  const [preview, setPreview] = React.useState<PromotionPreview | null>(null);
  const [mappings, setMappings] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    void (async () => {
      const res = await fetchStudentList({ status: "active" });
      if (res.ok) {
        setYears(res.data.filters.years);
        if (res.data.filters.years.length) {
          const y = String(res.data.filters.years[0]);
          setFromYear(y);
          setToYear(String(Number(y) + 1));
        }
      }
    })();
  }, []);

  async function loadPreview() {
    if (!fromYear) {
      setError("Select a year.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetchPromotionPreview(
        Number(fromYear),
        toYear ? Number(toYear) : undefined,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res.data);
      const next: Record<string, string> = {};
      for (const c of res.data.classes) {
        next[c.class_id] = c.suggested_to_class_id || "";
      }
      setMappings(next);
      if (res.data.to_year) setToYear(String(res.data.to_year));
    } finally {
      setLoading(false);
    }
  }

  function continueToRun() {
    if (!preview || !fromYear || !toYear) {
      setError("Load a preview first.");
      return;
    }
    const payload = {
      from_year: Number(fromYear),
      to_year: Number(toYear),
      mappings: Object.entries(mappings).map(
        ([from_class_id, to_class_id]) => ({
          from_class_id,
          to_class_id: to_class_id || null,
        }),
      ),
    };
    sessionStorage.setItem("sofia_promotion_run", JSON.stringify(payload));
    void router.push("/students/promotion/run");
  }

  const allClasses = preview?.classes ?? [];
  const sourceClasses = allClasses.filter((c) => c.student_count > 0);
  const destOptions = allClasses.map((c) => ({
    id: c.class_id,
    name: c.class_name,
  }));

  return (
    <AppShell
      title="Promotion"
      breadcrumb={["Student Management", "Promotion"]}
      heading="Student promotion"
      subtitle="Select a year and map each class to its next placement."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block text-xs font-medium text-slate-500">
          From year
          <select
            className={`mt-1 block ${selectClass}`}
            value={fromYear}
            onChange={(e) => setFromYear(e.target.value)}
          >
            <option value="">Select…</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
            {!years.includes(new Date().getFullYear()) ? (
              <option value={new Date().getFullYear()}>
                {new Date().getFullYear()}
              </option>
            ) : null}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-500">
          To year
          <input
            type="number"
            className={`mt-1 block w-28 ${selectClass}`}
            value={toYear}
            onChange={(e) => setToYear(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void loadPreview()}
          disabled={loading}
          className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
        >
          {loading ? "Loading…" : "Show class mapping"}
        </button>
      </div>

      {preview ? (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">From class</th>
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3">Students</th>
                  <th className="px-4 py-3">Promote to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sourceClasses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No active students in classes for this year.
                    </td>
                  </tr>
                ) : (
                  sourceClasses.map((c) => (
                    <tr key={c.class_id}>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {c.class_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.level_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.student_count}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className={selectClass}
                          value={mappings[c.class_id] || ""}
                          onChange={(e) =>
                            setMappings((prev) => ({
                              ...prev,
                              [c.class_id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">— Skip / graduate —</option>
                          {destOptions
                            .filter((d) => d.id !== c.class_id)
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          {c.suggested_to_class_id &&
                          !destOptions.some(
                            (d) => d.id === c.suggested_to_class_id,
                          ) ? (
                            <option value={c.suggested_to_class_id}>
                              {c.suggested_to_class_name}
                            </option>
                          ) : null}
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={continueToRun}
              className="cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white"
            >
              Preview & confirm
            </button>
            <Link
              href="/students"
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
            >
              Cancel
            </Link>
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          Choose a year and load the class mapping to continue.
        </p>
      )}
    </AppShell>
  );
}
