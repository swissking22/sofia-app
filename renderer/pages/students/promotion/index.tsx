import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StudentTable,
  selectClass,
} from "../../../components/students/ui";
import {
  fetchPromotionPreview,
  fetchStudentList,
  type PromotionPreview,
} from "../../../lib/student-mgmt";

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
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

      <FilterBar
        filters={
          <>
            <FilterField label="From year">
              <select
                className={selectClass}
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
            </FilterField>
            <FilterField label="To year">
              <input
                type="number"
                className={`w-28 ${selectClass}`}
                value={toYear}
                onChange={(e) => setToYear(e.target.value)}
              />
            </FilterField>
          </>
        }
        actions={
          <SecondaryButton onClick={() => void loadPreview()} disabled={loading}>
            {loading ? "Loading…" : "Show class mapping"}
          </SecondaryButton>
        }
      />

      {preview ? (
        <>
          <StudentTable
            columns={["From class", "Level", "Students", "Promote to"]}
            loading={false}
          >
            {sourceClasses.length === 0 ? (
              <EmptyRow colSpan={4}>
                No active students in classes for this year.
              </EmptyRow>
            ) : (
              sourceClasses.map((c) => (
                <tr key={c.class_id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {c.class_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.level_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.student_count}</td>
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
          </StudentTable>

          <div className="mt-4 flex flex-wrap gap-3">
            <PrimaryButton onClick={continueToRun}>
              Preview & confirm
            </PrimaryButton>
            <SecondaryButton href="/students">Cancel</SecondaryButton>
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
