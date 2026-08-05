import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import { fetchAcademicStructure } from "../../../lib/academic-structure";
import { createAdmission, GENDER_OPTIONS } from "../../../lib/student-mgmt";

const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function CreateAdmissionPage() {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [levels, setLevels] = React.useState<
    Array<{ id: string; name: string }>
  >([]);
  const [classes, setClasses] = React.useState<
    Array<{ id: string; name: string; academic_level_id: string | null }>
  >([]);

  const [fullName, setFullName] = React.useState("");
  const [gender, setGender] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [levelId, setLevelId] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [admissionYear, setAdmissionYear] = React.useState(
    String(new Date().getFullYear()),
  );
  const [guardianName, setGuardianName] = React.useState("");
  const [guardianPhone, setGuardianPhone] = React.useState("");
  const [guardianEmail, setGuardianEmail] = React.useState("");
  const [guardianRelationship, setGuardianRelationship] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    void (async () => {
      const res = await fetchAcademicStructure();
      if (res.ok) {
        setLevels(
          res.data.levels
            .filter((l) => l.is_active === 1)
            .map((l) => ({ id: l.id, name: l.name })),
        );
        setClasses(
          res.data.classes
            .filter((c) => c.is_active === 1)
            .map((c) => ({
              id: c.id,
              name: c.name,
              academic_level_id: c.academic_level_id,
            })),
        );
      }
    })();
  }, []);

  const filteredClasses = levelId
    ? classes.filter((c) => c.academic_level_id === levelId)
    : classes;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await createAdmission({
        full_name: fullName.trim(),
        gender: gender || null,
        date_of_birth: dateOfBirth || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        academic_level_id: levelId || null,
        preferred_class_id: classId || null,
        admission_year: admissionYear ? Number(admissionYear) : null,
        guardian_name: guardianName || null,
        guardian_phone: guardianPhone || null,
        guardian_email: guardianEmail || null,
        guardian_relationship: guardianRelationship || null,
        notes: notes || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Application submitted with pending status.");
      setTimeout(() => {
        void router.push("/students");
      }, 1200);
    } catch {
      setError("Could not create admission.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="New admission"
      breadcrumb={["Student Management", "Admissions", "New"]}
      heading="New admission application"
      subtitle="Capture applicant details. Applications start as pending."
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

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <FormSection title="Applicant" description="Personal details.">
          <FormField
            label="Full name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            fullWidth
          />
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Gender
            </span>
            <select
              className={fieldClass}
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">Select…</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <FormField
            label="Date of birth"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
          <FormField
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <FormField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FormField
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            fullWidth
          />
        </FormSection>

        <FormSection title="Preferred placement">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Level
            </span>
            <select
              className={fieldClass}
              value={levelId}
              onChange={(e) => {
                setLevelId(e.target.value);
                setClassId("");
              }}
            >
              <option value="">Any</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Preferred class
            </span>
            <select
              className={fieldClass}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">Any</option>
              {filteredClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <FormField
            label="Admission year"
            type="number"
            value={admissionYear}
            onChange={(e) => setAdmissionYear(e.target.value)}
          />
          <FormField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
          />
        </FormSection>

        <FormSection title="Guardian">
          <FormField
            label="Guardian name"
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
          />
          <FormField
            label="Relationship"
            value={guardianRelationship}
            onChange={(e) => setGuardianRelationship(e.target.value)}
          />
          <FormField
            label="Guardian phone"
            value={guardianPhone}
            onChange={(e) => setGuardianPhone(e.target.value)}
          />
          <FormField
            label="Guardian email"
            type="email"
            value={guardianEmail}
            onChange={(e) => setGuardianEmail(e.target.value)}
          />
        </FormSection>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Submitting…" : "Submit application"}
          </button>
          <Link
            href="/students"
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
          >
            Cancel
          </Link>
        </div>
      </form>
    </AppShell>
  );
}
