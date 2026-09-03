import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../components/layout/AppShell";
import { FormField, FormSection } from "../../components/setup";
import {
  PageAlert,
  PrimaryButton,
  SecondaryButton,
  fieldClass,
} from "../../components/students/ui";
import {
  fetchAcademicStructure,
  type AcademicStructureData,
} from "../../lib/academic-structure";
import { fetchAcademicYearSetup } from "../../lib/academic-year";
import {
  ADMISSION_TYPE_OPTIONS,
  RESIDENCE_TYPE_OPTIONS,
  createStudent,
  GENDER_OPTIONS,
} from "../../lib/student-mgmt";

export default function CreateStudentPage() {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [structure, setStructure] =
    React.useState<AcademicStructureData | null>(null);
  const [defaultYear, setDefaultYear] = React.useState(
    new Date().getFullYear(),
  );

  const [name, setName] = React.useState("");
  const [gender, setGender] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [levelId, setLevelId] = React.useState("");
  const [sectionId, setSectionId] = React.useState("");
  const [specId, setSpecId] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [admissionYear, setAdmissionYear] = React.useState("");
  const [admissionType, setAdmissionType] = React.useState("new");
  const [residenceType, setResidenceType] = React.useState("day");
  const [guardianName, setGuardianName] = React.useState("");
  const [guardianPhone, setGuardianPhone] = React.useState("");
  const [guardianEmail, setGuardianEmail] = React.useState("");
  const [guardianRelationship, setGuardianRelationship] = React.useState("");

  React.useEffect(() => {
    void (async () => {
      const [structureRes, yearRes] = await Promise.all([
        fetchAcademicStructure(),
        fetchAcademicYearSetup(),
      ]);
      if (structureRes.ok) setStructure(structureRes.data);
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

  const levels = React.useMemo(
    () =>
      (structure?.levels ?? [])
        .filter((l) => l.is_active === 1)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order),
    [structure],
  );

  const activeClasses = React.useMemo(
    () => (structure?.classes ?? []).filter((c) => c.is_active === 1),
    [structure],
  );

  const sections = React.useMemo(() => {
    if (!levelId) return [];
    const sectionIds = new Set(
      activeClasses
        .filter((c) => c.academic_level_id === levelId && c.section_id)
        .map((c) => c.section_id as string),
    );
    return (structure?.sections ?? []).filter(
      (s) => s.is_active === 1 && sectionIds.has(s.id),
    );
  }, [structure, activeClasses, levelId]);

  const specializations = React.useMemo(() => {
    if (!levelId || !sectionId) return [];
    const specIds = new Set(
      activeClasses
        .filter(
          (c) =>
            c.academic_level_id === levelId &&
            c.section_id === sectionId &&
            c.specialization_id,
        )
        .map((c) => c.specialization_id as string),
    );
    return (structure?.specializations ?? []).filter(
      (s) =>
        s.is_active === 1 && s.section_id === sectionId && specIds.has(s.id),
    );
  }, [structure, activeClasses, levelId, sectionId]);

  const classOptions = React.useMemo(() => {
    if (!levelId || !sectionId) return [];
    return activeClasses.filter((c) => {
      if (c.academic_level_id !== levelId) return false;
      if (c.section_id !== sectionId) return false;
      if (specializations.length > 0) {
        return specId ? c.specialization_id === specId : false;
      }
      return true;
    });
  }, [activeClasses, levelId, sectionId, specId, specializations.length]);

  function onLevelChange(value: string) {
    setLevelId(value);
    setSectionId("");
    setSpecId("");
    setClassId("");
  }

  function onSectionChange(value: string) {
    setSectionId(value);
    setSpecId("");
    setClassId("");
  }

  function onSpecChange(value: string) {
    setSpecId(value);
    setClassId("");
  }

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
    if (!guardianName.trim()) {
      setError("Guardian name is required.");
      return;
    }
    if (!guardianPhone.trim()) {
      setError("Guardian phone is required.");
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
        residence_type: residenceType === "boarding" ? "boarding" : "day",
        guardian_name: guardianName.trim(),
        guardian_phone: guardianPhone.trim(),
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
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}

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
          description="Choose level, department, then class. Student ID is auto-generated from your school pattern."
        >
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Level <span className="text-red-500">*</span>
            </span>
            <select
              className={fieldClass}
              value={levelId}
              onChange={(e) => onLevelChange(e.target.value)}
              required
            >
              <option value="">Select level…</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Department <span className="text-red-500">*</span>
            </span>
            <select
              className={fieldClass}
              value={sectionId}
              onChange={(e) => onSectionChange(e.target.value)}
              required
              disabled={!levelId}
            >
              <option value="">
                {levelId ? "Select department…" : "Select a level first"}
              </option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {specializations.length > 0 ? (
            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Specialization <span className="text-red-500">*</span>
              </span>
              <select
                className={fieldClass}
                value={specId}
                onChange={(e) => onSpecChange(e.target.value)}
                required
                disabled={!sectionId}
              >
                <option value="">Select specialization…</option>
                {specializations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.abbreviation ? ` (${s.abbreviation})` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Class <span className="text-red-500">*</span>
            </span>
            <select
              className={fieldClass}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              required
              disabled={!sectionId || (specializations.length > 0 && !specId)}
            >
              <option value="">
                {!sectionId
                  ? "Select department first"
                  : specializations.length > 0 && !specId
                    ? "Select specialization first"
                    : classOptions.length
                      ? "Select class…"
                      : "No classes for this selection"}
              </option>
              {classOptions.map((c) => (
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
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Residence
            </span>
            <select
              className={fieldClass}
              value={residenceType}
              onChange={(e) => setResidenceType(e.target.value)}
            >
              {RESIDENCE_TYPE_OPTIONS.map((o) => (
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
          description="Primary contact for the student. Name and phone are required."
        >
          <FormField
            label="Guardian name"
            required
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
            required
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
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : "Create student"}
          </PrimaryButton>
          <SecondaryButton href="/students">Cancel</SecondaryButton>
        </div>
      </form>
    </AppShell>
  );
}
