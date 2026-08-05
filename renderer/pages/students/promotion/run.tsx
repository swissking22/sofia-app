import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  fetchPromotionPreview,
  runPromotion,
  type PromotionPreview,
} from "../../../lib/student-mgmt";

interface StoredPayload {
  from_year: number;
  to_year: number;
  mappings: Array<{ from_class_id: string; to_class_id: string | null }>;
}

export default function PromotionRunPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [payload, setPayload] = React.useState<StoredPayload | null>(null);
  const [preview, setPreview] = React.useState<PromotionPreview | null>(null);

  React.useEffect(() => {
    void (async () => {
      try {
        const raw = sessionStorage.getItem("sofia_promotion_run");
        if (!raw) {
          setError(
            "No promotion mapping found. Start from the promotion page.",
          );
          setLoading(false);
          return;
        }
        const parsed = JSON.parse(raw) as StoredPayload;
        setPayload(parsed);
        const res = await fetchPromotionPreview(
          parsed.from_year,
          parsed.to_year,
        );
        if (!res.ok) {
          setError(res.error);
        } else {
          setPreview(res.data);
        }
      } catch {
        setError("Could not load promotion preview.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeMappings = (payload?.mappings ?? []).filter((m) => m.to_class_id);
  const classNameById = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of preview?.classes ?? []) {
      map[c.class_id] = c.class_name;
      if (c.suggested_to_class_id && c.suggested_to_class_name) {
        map[c.suggested_to_class_id] = c.suggested_to_class_name;
      }
    }
    return map;
  }, [preview]);

  const totalStudents = activeMappings.reduce((sum, m) => {
    const cls = preview?.classes.find((c) => c.class_id === m.from_class_id);
    return sum + (cls?.student_count ?? 0);
  }, 0);

  async function confirmRun() {
    if (!payload) return;
    setError("");
    setSuccess("");
    setRunning(true);
    try {
      const res = await runPromotion({
        ...payload,
        mappings: activeMappings,
        confirm: true,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const data = res.data as {
        run_id: string;
        moved: number;
        status: string;
      };
      setSuccess(`Promotion complete. ${data.moved} student(s) moved.`);
      sessionStorage.removeItem("sofia_promotion_run");
      setTimeout(() => {
        void router.push("/students");
      }, 1500);
    } catch {
      setError("Promotion failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <AppShell
      title="Confirm promotion"
      breadcrumb={["Student Management", "Promotion", "Confirm"]}
      heading="Preview & confirm promotion"
      subtitle="Review the mapping, then confirm to move students."
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

      {loading ? (
        <p className="text-sm text-slate-500">Loading preview…</p>
      ) : payload ? (
        <>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            Promoting from <strong>{payload.from_year}</strong> to{" "}
            <strong>{payload.to_year}</strong> ·{" "}
            <strong>{activeMappings.length}</strong> class mapping(s) · about{" "}
            <strong>{totalStudents}</strong> student(s).
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">To</th>
                  <th className="px-4 py-3">Students</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeMappings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No destination mappings selected.
                    </td>
                  </tr>
                ) : (
                  activeMappings.map((m) => {
                    const count =
                      preview?.classes.find(
                        (c) => c.class_id === m.from_class_id,
                      )?.student_count ?? 0;
                    return (
                      <tr key={m.from_class_id}>
                        <td className="px-4 py-3 font-medium">
                          {classNameById[m.from_class_id] || m.from_class_id}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {m.to_class_id
                            ? classNameById[m.to_class_id] || m.to_class_id
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{count}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={running || activeMappings.length === 0}
              onClick={() => void confirmRun()}
              className="cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {running ? "Running…" : "Confirm promotion"}
            </button>
            <Link
              href="/students/promotion"
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
            >
              Back to mapping
            </Link>
          </div>
        </>
      ) : (
        <Link
          href="/students/promotion"
          className="text-sm font-semibold text-(--sofia-primary)"
        >
          Go to promotion setup
        </Link>
      )}
    </AppShell>
  );
}
