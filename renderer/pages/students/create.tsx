import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "../../components/layout/AppShell";
import { FormField, FormSection } from "../../components/setup";
import { fetchAcademicStructure } from "../../lib/academic-structure";
import { fetchAcademicYearSetup } from "../../lib/academic-year";
import {
  ADMISSION_TYPE_OPTIONS,
  createStudent,
  GENDER_OPTIONS,
} from "../../lib/student-mgmt";

const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function CreateStudentPage() {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [classes, setClasses] = React.useState<
    Array<{ id: string; name: string }>
  >([]);
  const [defaultYear, setDefaultYear] = React.useState(
    new Date().getFullYear(),
  );

  const [name, setName] = React.useState("");
  const [gender, setGender] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [admissionYear, setAdmissionYear] = React.useState("");
  const [admissionType, setAdmissionType] = React.useState("new");
  const [guardianName, setGuardianName] = React.useState("");
  const [guardianPhone, setGuardianPhone] = React.useState("");
  const [guardianEmail, setGuardianEmail] = React.useState("");
  const [guardianRelationship, setGuardianRelationship] = React.useState("");

  React.useEffect(() => {
    void (async () => {
      const [structure, yearRes] = await Promise.all([
        fetchAcademicStructure(),
        fetchAcademicYearSetup(),
      ]);
      if (structure.ok) {
        setClasses(
          structure.data.classes
            .filter((c) => c.is_active === 1)
            .map((c) => ({ id: c.id, name: c.name })),
        );
      }
      if (yearRes.ok && yearRes.setup?.name) {
        const match = yearRes.setup.name.match(/(\d{4})/);
        if (match) {
          setDefaultYear(Number(match[1]));
          setAdmissionYear(match[1]);
        }
      } else {
        setAdmissionYear(String(new Date().getFullYear()));
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Student name is required.");
      return;
    }
    if (!classId) {
      setError("Class is required.");
      return;
    }
    const year = Number(admissionYear || defaultYear);
    if (!year) {
      setError("Admission year is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await createStudent({
        name: name.trim(),
        class_id: classId,
        admission_year: year,
        gender: gender || null,
        date_of_birth: dateOfBirth || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        admission_type: admissionType || null,
        guardian_name: guardianName || null,
        guardian_phone: guardianPhone || null,
        guardian_email: guardianEmail || null,
        guardian_relationship: guardianRelationship || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.push(`/students/${res.data.id}`);
    } catch {
      setError("Could not create student.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Add student"
      breadcrumb={["Student Management", "Students", "Add"]}
      heading="Add student"
      subtitle="Personal, admission, and guardian details. Student ID is generated on save."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <FormSection
          title="Personal information"
          description="Basic identity and contact details."
        >
          <FormField
            label="Full name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Student full name"
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
            placeholder="Student phone"
          />
          <FormField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@email.com"
          />
          <FormField
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Home address"
            fullWidth
          />
        </FormSection>

        <FormSection
          title="Admission"
          description="Class placement and admission year. Student ID is auto-generated from your school pattern."
        >
          <label className="mb-4 block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Class <span className="text-red-500">*</span>
            </span>
            <select
              className={fieldClass}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              required
            >
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <FormField
            label="Admission year"
            type="number"
            required
            value={admissionYear}
            onChange={(e) => setAdmissionYear(e.target.value)}
          />
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Admission type
            </span>
            <select
              className={fieldClass}
              value={admissionType}
              onChange={(e) => setAdmissionType(e.target.value)}
            >
              {ADMISSION_TYPE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mb-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500 sm:col-span-2">
            Student ID will be generated automatically when you save.
          </div>
        </FormSection>

        <FormSection
          title="Guardian"
          description="Primary contact for the student."
        >
          <FormField
            label="Guardian name"
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
          />
          <FormField
            label="Relationship"
            value={guardianRelationship}
            onChange={(e) => setGuardianRelationship(e.target.value)}
            placeholder="Parent, uncle, …"
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
            {saving ? "Saving…" : "Create student"}
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
