import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../../components/layout/AppShell";
import { IdCardModuleNav } from "../../../../components/id-cards/ModuleNav";
import {
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  selectClass,
} from "../../../../components/students/ui";
import { wizardIdCardTemplate } from "../../../../lib/student-id-cards";

const FIELDS = [
  { id: "name", label: "Student name" },
  { id: "student_id", label: "Student ID" },
  { id: "photo", label: "Photo" },
  { id: "class", label: "Class" },
  { id: "department", label: "Department" },
  { id: "dob", label: "Date of birth" },
  { id: "gender", label: "Gender" },
  { id: "academic_year", label: "Academic year" },
  { id: "qr", label: "QR code" },
  { id: "barcode", label: "Barcode" },
];

export default function NewTemplateWizardPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState("Student ID");
  const [cardType, setCardType] = React.useState<"student" | "staff">(
    "student",
  );
  const [orientation, setOrientation] = React.useState<
    "landscape" | "portrait"
  >("landscape");
  const [starting, setStarting] = React.useState<
    "blank" | "classic" | "modern" | "minimal" | "branding"
  >("classic");
  const [fields, setFields] = React.useState<string[]>([
    "name",
    "student_id",
    "photo",
    "class",
    "department",
    "academic_year",
    "qr",
    "barcode",
  ]);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const res = await wizardIdCardTemplate({
      name,
      card_type: cardType,
      orientation,
      starting,
      fields,
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else await router.push(`/students/id-cards/designer/${res.data.id}`);
  }

  return (
    <AppShell
      title="Create template"
      breadcrumb={["Student Management", "ID Cards", "Create template"]}
      heading="Create template"
      subtitle="A short wizard for registrars. You can still change every detail in the designer."
    >
      <IdCardModuleNav />
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Step {step} of 5
        </p>
        {step === 1 ? (
          <div className="mt-4 space-y-3">
            <h2 className="font-semibold">Card type</h2>
            <select
              className={selectClass}
              value={cardType}
              onChange={(e) =>
                setCardType(e.target.value as "student" | "staff")
              }
            >
              <option value="student">Student ID</option>
              <option value="staff">
                Staff ID (same designer, staff fields later)
              </option>
            </select>
            <label className="block text-sm">
              Template name
              <input
                className={`${selectClass} mt-1 w-full`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="mt-4 space-y-3">
            <h2 className="font-semibold">Orientation</h2>
            <select
              className={selectClass}
              value={orientation}
              onChange={(e) =>
                setOrientation(e.target.value as "landscape" | "portrait")
              }
            >
              <option value="landscape">Horizontal</option>
              <option value="portrait">Vertical</option>
            </select>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="mt-4 space-y-3">
            <h2 className="font-semibold">Starting design</h2>
            <select
              className={selectClass}
              value={starting}
              onChange={(e) => setStarting(e.target.value as typeof starting)}
            >
              <option value="classic">Classic</option>
              <option value="modern">Modern</option>
              <option value="minimal">Minimal</option>
              <option value="branding">Professional blue</option>
              <option value="blank">Blank</option>
            </select>
          </div>
        ) : null}
        {step === 4 ? (
          <div className="mt-4 space-y-2">
            <h2 className="font-semibold">Information to include</h2>
            {FIELDS.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={fields.includes(f.id)}
                  onChange={(e) =>
                    setFields((cur) =>
                      e.target.checked
                        ? [...cur, f.id]
                        : cur.filter((x) => x !== f.id),
                    )
                  }
                />
                {f.label}
              </label>
            ))}
          </div>
        ) : null}
        {step === 5 ? (
          <div className="mt-4 text-sm text-slate-600">
            <p>
              {name} · {cardType} · {orientation} · {starting}
            </p>
            <p className="mt-2">
              Save to open the designer, then preview with a real student.
            </p>
          </div>
        ) : null}
        <div className="mt-6 flex gap-2">
          {step > 1 ? (
            <SecondaryButton onClick={() => setStep((n) => n - 1)}>
              Back
            </SecondaryButton>
          ) : null}
          {step < 5 ? (
            <PrimaryButton onClick={() => setStep((n) => n + 1)}>
              Continue
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save template"}
            </PrimaryButton>
          )}
        </div>
      </div>
    </AppShell>
  );
}
