import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import {
  ConfirmModal,
  EmptyRow,
  PageAlert,
  PrimaryButton,
  StudentTable,
} from "../../../components/students/ui";
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
  const [confirmOpen, setConfirmOpen] = React.useState(false);
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
  const skippedMappings = (payload?.mappings ?? []).filter(
    (m) => !m.to_class_id,
  );

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

  const skippedStudents = skippedMappings.reduce((sum, m) => {
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
      setConfirmOpen(false);
      setTimeout(() => {
        void router.push("/students");
      }, 1500);
    } catch {
      setError("Promotion failed.");
    } finally {
      setRunning(false);
    }
  }

  function renderMappingRow(m: {
    from_class_id: string;
    to_class_id: string | null;
  }) {
    const count =
      preview?.classes.find((c) => c.class_id === m.from_class_id)
        ?.student_count ?? 0;
    return (
      <tr key={m.from_class_id} className="hover:bg-slate-50/80">
        <td className="px-4 py-3 font-medium text-slate-800">
          {classNameById[m.from_class_id] || m.from_class_id}
        </td>
        <td className="px-4 py-3 text-slate-700">
          {m.to_class_id
            ? classNameById[m.to_class_id] || m.to_class_id
            : "— Skip / graduate —"}
        </td>
        <td className="px-4 py-3 text-slate-600">{count}</td>
      </tr>
    );
  }

  return (
    <AppShell
      title="Confirm promotion"
      breadcrumb={["Student Management", "Promotion", "Confirm"]}
      heading="Preview & confirm promotion"
      subtitle="Review the mapping, then confirm to move students."
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading preview…</p>
      ) : payload ? (
        <>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            Promoting from <strong>{payload.from_year}</strong> to{" "}
            <strong>{payload.to_year}</strong> ·{" "}
            <strong>{activeMappings.length}</strong> class mapping(s) · about{" "}
            <strong>{totalStudents}</strong> student(s) to move
            {skippedMappings.length > 0 ? (
              <>
                {" "}
                · <strong>{skippedMappings.length}</strong> class(es) skipped (
                {skippedStudents} student(s))
              </>
            ) : null}
            .
          </div>

          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            Active mappings
          </h3>
          <StudentTable columns={["From", "To", "Students"]} loading={false}>
            {activeMappings.length === 0 ? (
              <EmptyRow colSpan={3}>No destination mappings selected.</EmptyRow>
            ) : (
              activeMappings.map(renderMappingRow)
            )}
          </StudentTable>

          {skippedMappings.length > 0 ? (
            <>
              <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-900">
                Skipped (no destination)
              </h3>
              <p className="mb-3 text-xs text-slate-500">
                Students in these classes will not be promoted. They may
                graduate or remain in place depending on your school policy.
              </p>
              <StudentTable
                columns={["From", "To", "Students"]}
                loading={false}
              >
                {skippedMappings.map(renderMappingRow)}
              </StudentTable>
            </>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <PrimaryButton
              disabled={running || activeMappings.length === 0}
              onClick={() => setConfirmOpen(true)}
            >
              Confirm promotion
            </PrimaryButton>
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

      <ConfirmModal
        open={confirmOpen}
        title="Run promotion?"
        description={
          <>
            This will move about <strong>{totalStudents}</strong> student(s)
            from <strong>{payload?.from_year}</strong> to{" "}
            <strong>{payload?.to_year}</strong> according to{" "}
            {activeMappings.length} class mapping(s). This action cannot be
            undone from this screen.
          </>
        }
        confirmLabel="Run promotion"
        danger
        busy={running}
        onConfirm={() => void confirmRun()}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppShell>
  );
}
