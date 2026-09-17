import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Download01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { FormSection, SetupFooter } from "../../components/setup";
import {
  SetupShell,
  useSetupProgress,
} from "../../components/setup/SetupShell";
import { Icon } from "../../components/ui/Icon";
import {
  ADMISSION_TYPE_OPTIONS,
  DEFAULT_STUDENT_ID_FORMAT,
  downloadStudentImportTemplate,
  fetchStudentSettings,
  formatStudentImportSummary,
  importStudents,
  parseStudentCsv,
  saveStudentSettings,
  STUDENT_INFO_FIELD_OPTIONS,
  type AdmissionTypeKey,
  type StudentInfoFieldKey,
  type StudentSettings,
} from "../../lib/students";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
} from "../../lib/setup";

export default function StudentSetupPage() {
  return (
    <SetupShell stepId="students" aside={<StudentsAside />}>
      <StudentSetupForm />
    </SetupShell>
  );
}

function StudentsAside() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">
        What this prepares
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Required profile fields, admission types, and optional bulk import. ID
        patterns are configured in Student ID Settings.
      </p>
      <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Admission profile fields
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          CSV import (level, department, residence)
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          New / returning / transfer pathways
        </li>
      </ul>
    </div>
  );
}

function StudentSetupForm() {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [draftSaving, setDraftSaving] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [studentCount, setStudentCount] = React.useState(0);
  const [idFormat, setIdFormat] = React.useState(DEFAULT_STUDENT_ID_FORMAT);

  const [fields, setFields] = React.useState<
    Record<StudentInfoFieldKey, boolean>
  >({
    full_name: true,
    gender: true,
    date_of_birth: true,
    place_of_birth: true,
    parent_information: true,
    emergency_contact: true,
  });
  const [admission, setAdmission] = React.useState<
    Record<AdmissionTypeKey, boolean>
  >({
    new: true,
    returning: true,
    transfer: true,
  });

  const applySettings = React.useCallback((data: StudentSettings) => {
    setIdFormat(data.student_id_format);
    setFields(data.fields);
    setAdmission(data.admission);
    setStudentCount(data.student_count);
  }, []);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchStudentSettings();
      if (res.ok) applySettings(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, [applySettings]);

  function toggleField(key: StudentInfoFieldKey) {
    if (key === "full_name") return;
    setFields((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAdmission(key: AdmissionTypeKey) {
    setAdmission((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function buildInput() {
    return {
      student_id_format: idFormat.trim() || DEFAULT_STUDENT_ID_FORMAT,
      fields: { ...fields, full_name: true },
      admission,
    };
  }

  async function persistSettings(): Promise<boolean> {
    const res = await saveStudentSettings(buildInput());
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    applySettings(res.data);
    return true;
  }

  async function handleSaveDraft() {
    setDraftSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persistSettings())) return;
      const draft = await saveSetupDraft("students");
      if (!draft.ok) {
        setError(draft.error);
        return;
      }
      await refreshProgress();
      setSuccess("Student settings draft saved.");
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleContinue() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persistSettings())) return;
      const done = await completeSetupStep("students");
      if (!done.ok) {
        setError(done.error);
        return;
      }
      await refreshProgress();
      await router.push(getNextSetupHref("students"));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file: File) {
    setError("");
    setSuccess("");
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      setError(
        "Save the Excel file as CSV (File → Save As → CSV) and upload that file.",
      );
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseStudentCsv(text);
      if (!rows.length) {
        setError(
          "Could not parse the file. Use the template headers (Full Name, Date of Birth, Level, Department, Specialization, Residence Type).",
        );
        return;
      }
      if (!(await persistSettings())) return;
      const res = await importStudents(rows);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStudentCount(res.data.student_count);
      setSuccess(formatStudentImportSummary(res.data));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading student settings…</p>;
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <FormSection
        title="Student ID"
        description="ID patterns and school short codes are managed in Student ID Settings."
        layout="stack"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3">
          <p className="text-sm text-slate-600">
            Configure presets, pattern builder, and sequence rules.
          </p>
          <Link
            href="/setup/student-id"
            className="cursor-pointer rounded-xl bg-(--sofia-primary) px-3.5 py-2 text-sm font-semibold text-white hover:bg-(--sofia-primary-dark)"
          >
            Open Student ID Settings
          </Link>
        </div>
      </FormSection>

      <FormSection
        title="Student Information Fields"
        description="Choose which fields appear on student records and admission forms."
        layout="stack"
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STUDENT_INFO_FIELD_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition ${
                fields[opt.key]
                  ? "border-(--sofia-primary)/30 bg-(--sofia-primary)/5 text-slate-900"
                  : "border-slate-200 bg-white text-slate-700"
              } ${opt.required ? "opacity-90" : ""}`}
            >
              <input
                type="checkbox"
                checked={fields[opt.key]}
                disabled={opt.required}
                onChange={() => toggleField(opt.key)}
                className="h-4 w-4 rounded border-slate-300 text-(--sofia-primary)"
              />
              <span className="font-medium">{opt.label}</span>
              {opt.required ? (
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Required
                </span>
              ) : null}
            </label>
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Student Import"
        description="Bulk-prepare the student database from a CSV of name, date of birth, level, department, specialization, and residence."
        layout="stack"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-(--sofia-primary) px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-(--sofia-primary-dark) disabled:opacity-60"
          >
            <Icon icon={Upload01Icon} size={16} />
            {importing ? "Importing…" : "Upload Excel file"}
          </button>
          <button
            type="button"
            onClick={() => downloadStudentImportTemplate()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-(--sofia-primary) hover:text-(--sofia-primary)"
          >
            <Icon icon={Download01Icon} size={16} />
            Download template
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Template opens in Excel. Sofia matches each row to an existing class
          from Level + Department + Specialization (it does not create classes).
          Residence (Day / Boarding) is stored for fee structures. If several
          classes share that combination, add a Class column (e.g. Form 1 B).
          Current students in database:{" "}
          <span className="font-semibold text-slate-700">{studentCount}</span>
        </p>
      </FormSection>

      <FormSection
        title="Admission Settings"
        description="Enable the admission pathways your school uses."
        layout="stack"
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ADMISSION_TYPE_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-3.5 py-3 transition ${
                admission[opt.key]
                  ? "border-(--sofia-primary)/30 bg-(--sofia-primary)/5"
                  : "border-slate-200 bg-white"
              }`}
            >
              <span className="flex items-center gap-2.5 text-sm font-semibold text-slate-900">
                <input
                  type="checkbox"
                  checked={admission[opt.key]}
                  onChange={() => toggleAdmission(opt.key)}
                  className="h-4 w-4 rounded border-slate-300 text-(--sofia-primary)"
                />
                {opt.label}
              </span>
              <span className="pl-6 text-xs text-slate-500">
                {opt.description}
              </span>
            </label>
          ))}
        </div>
      </FormSection>

      <SetupFooter
        stepId="students"
        onSaveDraft={() => void handleSaveDraft()}
        onContinue={() => void handleContinue()}
        saving={saving}
        draftSaving={draftSaving}
      />
    </div>
  );
}
