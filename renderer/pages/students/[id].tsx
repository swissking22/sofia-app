import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Upload04Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../components/layout/AppShell";
import {
  ActionDrawer,
  EmptyRow,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  StudentTable,
} from "../../components/students/ui";
import { Icon } from "../../components/ui/Icon";
import {
  DOCUMENT_TYPE_OPTIONS,
  fetchStudent,
  fetchStudentDocuments,
  fetchTransfers,
  STATUS_LABELS,
  updateStudent,
  type StudentDocumentDto,
  type StudentDto,
  type TransferDto,
} from "../../lib/student-mgmt";
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  fetchFinanceMeta,
  fetchStudentFinanceSummary,
  formatMoney,
  type StudentFinanceSummary,
} from "../../lib/finance-mgmt";

type TabKey = "overview" | "academic" | "documents" | "finance";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "academic", label: "Academic History" },
  { key: "documents", label: "Documents" },
  { key: "finance", label: "Finance" },
];

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-slate-100 py-2.5 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 font-medium text-slate-800">{value || "—"}</dd>
    </div>
  );
}

function docTypeLabel(key: string): string {
  return DOCUMENT_TYPE_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

export default function StudentDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [tab, setTab] = React.useState<TabKey>("overview");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [student, setStudent] = React.useState<StudentDto | null>(null);
  const [docs, setDocs] = React.useState<StudentDocumentDto[]>([]);
  const [transfers, setTransfers] = React.useState<TransferDto[]>([]);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [finance, setFinance] = React.useState<StudentFinanceSummary | null>(
    null
  );
  const [currency, setCurrency] = React.useState("");

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [sRes, dRes, tRes, fRes, metaRes] = await Promise.all([
      fetchStudent(id),
      fetchStudentDocuments(id),
      fetchTransfers(),
      fetchStudentFinanceSummary(id),
      fetchFinanceMeta(),
    ]);
    if (sRes.ok) setStudent(sRes.data);
    else setError(sRes.error);
    if (dRes.ok) setDocs(dRes.data);
    if (tRes.ok) {
      setTransfers(tRes.data.filter((t) => t.student_id === id));
    }
    if (fRes.ok) setFinance(fRes.data);
    if (metaRes.ok) setCurrency(metaRes.data.currency);
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(status: "active" | "alumni" | "transferred") {
    if (!student) return;
    setError("");
    setSuccess("");
    const res = await updateStudent({ id: student.id, status });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStudent(res.data);
    setSuccess(`Status updated to ${STATUS_LABELS[status] ?? status}.`);
    setStatusOpen(false);
  }

  if (loading) {
    return (
      <AppShell
        title="Student"
        breadcrumb={["Student Management", "Students"]}
        heading="Student"
      >
        <p className="text-sm text-slate-500">Loading…</p>
      </AppShell>
    );
  }

  if (!student) {
    return (
      <AppShell
        title="Student"
        breadcrumb={["Student Management", "Students"]}
        heading="Student not found"
      >
        <PageAlert tone="error">{error || "Student not found."}</PageAlert>
        <SecondaryButton href="/students" className="mt-4">
          Back to students
        </SecondaryButton>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={student.name}
      breadcrumb={["Student Management", "Students", student.name]}
      heading={student.name}
      subtitle={`${student.student_code || "No ID"} · ${student.class_name || "No class"}`}
    >
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <div className="mb-5 flex flex-wrap items-start gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {student.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={student.photo_url}
              alt={`${student.name} photo`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-xs text-slate-400">No photo</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`cursor-pointer rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                    tab === t.key
                      ? "bg-(--sofia-primary) text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <StatusBadge
              status={student.status}
              label={STATUS_LABELS[student.status] ?? student.status}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => setStatusOpen(true)}>
              Update status
            </SecondaryButton>
            <SecondaryButton
              href={`/students/documents/upload?student_id=${student.id}`}
            >
              <Icon icon={Upload04Icon} size={16} />
              Upload document
            </SecondaryButton>
            <SecondaryButton href="/students">Back</SecondaryButton>
          </div>
        </div>
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Personal
            </h3>
            <dl>
              <InfoRow label="Student ID" value={student.student_code} />
              <InfoRow label="Gender" value={student.gender} />
              <InfoRow label="Date of birth" value={student.date_of_birth} />
              <InfoRow label="Phone" value={student.phone} />
              <InfoRow label="Email" value={student.email} />
              <InfoRow label="Address" value={student.address} />
            </dl>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Guardian
            </h3>
            <dl>
              <InfoRow label="Name" value={student.guardian_name} />
              <InfoRow
                label="Relationship"
                value={student.guardian_relationship}
              />
              <InfoRow label="Phone" value={student.guardian_phone} />
              <InfoRow label="Email" value={student.guardian_email} />
            </dl>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Placement
            </h3>
            <dl className="sm:columns-2">
              <InfoRow label="Class" value={student.class_name} />
              <InfoRow label="Level" value={student.level_name} />
              <InfoRow label="Department" value={student.section_name} />
              <InfoRow label="Admission year" value={student.admission_year} />
              <InfoRow label="Admission type" value={student.admission_type} />
              <InfoRow
                label="Status"
                value={
                  <StatusBadge
                    status={student.status}
                    label={STATUS_LABELS[student.status] ?? student.status}
                  />
                }
              />
            </dl>
          </section>
        </div>
      ) : null}

      {tab === "academic" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Current placement
            </h3>
            <StudentTable
              columns={["Year", "Level", "Class", "Department", "Note"]}
              loading={false}
            >
              <tr>
                <td className="px-4 py-3">{student.admission_year ?? "—"}</td>
                <td className="px-4 py-3">{student.level_name || "—"}</td>
                <td className="px-4 py-3">{student.class_name || "—"}</td>
                <td className="px-4 py-3">{student.section_name || "—"}</td>
                <td className="px-4 py-3 text-slate-500">Current placement</td>
              </tr>
            </StudentTable>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Transfers
            </h3>
            <StudentTable
              columns={["Destination school", "Date", "Status", "Reason"]}
              loading={false}
            >
              {transfers.length === 0 ? (
                <EmptyRow colSpan={4}>
                  No transfer records for this student.
                </EmptyRow>
              ) : (
                transfers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {t.to_school_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {t.transfer_date?.slice(0, 10) || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {t.reason || "—"}
                    </td>
                  </tr>
                ))
              )}
            </StudentTable>
          </section>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div>
          <div className="mb-4 flex justify-end">
            <PrimaryButton
              href={`/students/documents/upload?student_id=${student.id}`}
            >
              <Icon icon={Upload04Icon} size={16} />
              Upload
            </PrimaryButton>
          </div>
          <StudentTable
            columns={["Title", "Type", "Uploaded", ""]}
            loading={false}
          >
            {docs.length === 0 ? (
              <EmptyRow colSpan={4}>
                No documents yet.{" "}
                <Link
                  href={`/students/documents/upload?student_id=${student.id}`}
                  className="font-semibold text-(--sofia-primary) hover:underline"
                >
                  Upload one
                </Link>
              </EmptyRow>
            ) : (
              docs.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {d.title}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {docTypeLabel(d.document_type)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {d.created_at?.slice(0, 10) || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {d.file_url ? (
                      <a
                        href={d.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-(--sofia-primary) hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </StudentTable>
        </div>
      ) : null}

      {tab === "finance" ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-medium text-slate-500">
                Outstanding
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {formatMoney(finance?.outstanding ?? 0, currency)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-medium text-slate-500">
                Credit balance
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {formatMoney(finance?.credit_balance ?? 0, currency)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-medium text-slate-500">Invoices</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {finance?.invoices.length ?? 0}
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Invoices
            </h3>
            <StudentTable
              columns={["Invoice", "Issued", "Due", "Net", "Balance", "Status"]}
            >
              {!finance?.invoices.length ? (
                <EmptyRow colSpan={6} message="No invoices for this student." />
              ) : (
                finance.invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {inv.issue_date}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {inv.due_date ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {formatMoney(inv.net_payable, currency)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {formatMoney(inv.balance, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={inv.status}
                        label={INVOICE_STATUS_LABELS[inv.status]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </StudentTable>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Payments
            </h3>
            <StudentTable
              columns={["Payment #", "Date", "Amount", "Method", "Reference"]}
            >
              {!finance?.payments.length ? (
                <EmptyRow colSpan={5} message="No payments recorded." />
              ) : (
                finance.payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {p.payment_number}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.paid_at}</td>
                    <td className="px-4 py-3 font-medium">
                      {formatMoney(p.amount, currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.reference || "—"}
                    </td>
                  </tr>
                ))
              )}
            </StudentTable>
          </div>

          <p className="text-xs text-slate-400">
            Manage billing under{" "}
            <Link
              href="/finance/billing"
              className="font-medium text-(--sofia-primary)"
            >
              Finance → Student Billing
            </Link>
            .
          </p>
        </div>
      ) : null}

      <ActionDrawer
        open={statusOpen}
        title="Update status"
        subtitle={student.name}
        onClose={() => setStatusOpen(false)}
        footer={
          <SecondaryButton
            onClick={() => setStatusOpen(false)}
            className="w-full"
          >
            Close
          </SecondaryButton>
        }
      >
        <div className="flex flex-col gap-2">
          {(
            [
              ["active", "Active"],
              ["alumni", "Alumni"],
              ["transferred", "Transferred"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => void setStatus(key)}
              className={`cursor-pointer rounded-xl border px-4 py-3 text-left text-sm font-semibold ${
                student.status === key
                  ? "border-(--sofia-primary) bg-(--sofia-primary)/5 text-(--sofia-primary)"
                  : "border-slate-200 text-slate-700 hover:border-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </ActionDrawer>
    </AppShell>
  );
}
