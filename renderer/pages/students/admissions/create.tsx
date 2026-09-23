import React from "react";
import { useRouter } from "next/router";
import { AppShell } from "../../../components/layout/AppShell";
import { FormField, FormSection } from "../../../components/setup";
import { SquarePhotoUpload } from "../../../components/students/SquarePhotoUpload";
import {
  fieldClass,
  PageAlert,
  PrimaryButton,
  SecondaryButton,
} from "../../../components/students/ui";
import {
  fetchAcademicStructure,
  type AcademicStructureData,
} from "../../../lib/academic-structure";
import { fetchAcademicYearSetup } from "../../../lib/academic-year";
import { createAdmission, GENDER_OPTIONS } from "../../../lib/student-mgmt";
import {
  CAMEROON_PHONE_HINT,
  normalizeCameroonPhone,
} from "../../../lib/phone";

export default function CreateAdmissionPage() {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [structure, setStructure] =
    React.useState<AcademicStructureData | null>(null);
  const [defaultYear, setDefaultYear] = React.useState(
    new Date().getFullYear(),
  );

  const [fullName, setFullName] = React.useState("");
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
  const [guardianName, setGuardianName] = React.useState("");
  const [guardianPhone, setGuardianPhone] = React.useState("");
  const [guardianEmail, setGuardianEmail] = React.useState("");
  const [guardianRelationship, setGuardianRelationship] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = React.useState<string | null>(null);
  const [photoMime, setPhotoMime] = React.useState<string | null>(null);

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

  function onPhotoChange(photo: { dataUrl: string; mimeType: string } | null) {
    setError("");
    if (!photo) {
      setPhotoPreview(null);
      setPhotoBase64(null);
      setPhotoMime(null);
      return;
    }
    setPhotoPreview(photo.dataUrl);
    setPhotoBase64(photo.dataUrl);
    setPhotoMime(photo.mimeType);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!guardianPhone.trim()) {
      setError("Guardian phone is required.");
      return;
    }
    const normalizedGuardianPhone = normalizeCameroonPhone(guardianPhone);
    if (normalizedGuardianPhone === "invalid" || !normalizedGuardianPhone) {
      setError(`Invalid guardian phone. ${CAMEROON_PHONE_HINT}`);
      return;
    }
    const normalizedPhone = normalizeCameroonPhone(phone);
    if (normalizedPhone === "invalid") {
      setError(`Invalid phone. ${CAMEROON_PHONE_HINT}`);
      return;
    }
    setSaving(true);
    try {
      const res = await createAdmission({
        full_name: fullName.trim(),
        gender: gender || null,
        date_of_birth: dateOfBirth || null,
        phone: normalizedPhone,
        email: email || null,
        address: address || null,
        academic_level_id: levelId || null,
        preferred_class_id: classId || null,
        admission_year: admissionYear
          ? Number(admissionYear)
          : defaultYear || null,
        guardian_name: guardianName.trim() || null,
        guardian_phone: normalizedGuardianPhone,
        guardian_email: guardianEmail || null,
        guardian_relationship: guardianRelationship || null,
        notes: notes || null,
        photo_base64: photoBase64,
        photo_mime_type: photoMime,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Application submitted with pending status.");
      setTimeout(() => {
        void router.push("/students/admissions");
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
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {success ? <PageAlert tone="success">{success}</PageAlert> : null}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <FormSection
          title="Applicant"
          description="Personal details and 4×4 photo."
          layout="stack"
        >
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
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
                placeholder="670000001"
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
            </div>
            <SquarePhotoUpload
              preview={photoPreview}
              onChange={onPhotoChange}
              onError={setError}
            />
          </div>
        </FormSection>

        <FormSection
          title="Preferred placement"
          description="Choose level, department, then class. All placement fields are optional."
        >
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Level
            </span>
            <select
              className={fieldClass}
              value={levelId}
              onChange={(e) => onLevelChange(e.target.value)}
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
              Department
            </span>
            <select
              className={fieldClass}
              value={sectionId}
              onChange={(e) => onSectionChange(e.target.value)}
              disabled={!levelId}
            >
              <option value="">
                {levelId ? "Any" : "Select a level first"}
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
                Specialization
              </span>
              <select
                className={fieldClass}
                value={specId}
                onChange={(e) => onSpecChange(e.target.value)}
                disabled={!sectionId}
              >
                <option value="">Any</option>
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
              Preferred class
            </span>
            <select
              className={fieldClass}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={!sectionId || (specializations.length > 0 && !specId)}
            >
              <option value="">
                {!sectionId
                  ? "Select department first"
                  : specializations.length > 0 && !specId
                    ? "Select specialization first"
                    : classOptions.length
                      ? "Any"
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

        <FormSection
          title="Guardian"
          description="Primary contact for the applicant. Phone is required."
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
            required
            value={guardianPhone}
            onChange={(e) => setGuardianPhone(e.target.value)}
            placeholder="670000001"
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
            {saving ? "Submitting…" : "Submit application"}
          </PrimaryButton>
          <SecondaryButton href="/students/admissions">Cancel</SecondaryButton>
        </div>
      </form>
    </AppShell>
  );
}
