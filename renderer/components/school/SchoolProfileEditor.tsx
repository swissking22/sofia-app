import React from "react";
import { FileUploadField, FormField, FormSection, FormSelect } from "../setup";
import {
  EDUCATION_SYSTEMS,
  fetchSchoolProfile,
  SCHOOL_CATEGORIES,
  SCHOOL_TYPES,
  updateSchoolProfile,
  type SchoolProfile,
  type UpdateSchoolProfileInput,
} from "../../lib/school-profile";

export interface SchoolProfilePreviewState {
  name: string;
  logoUrl: string | null;
  region: string;
  division: string;
  subdivision: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  schoolType: string;
  schoolCategory: string;
}

interface PendingAsset {
  base64: string;
  mimeType: string;
  preview: string;
}

function readFileAsDataUrl(
  file: File,
): Promise<{ dataUrl: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        dataUrl: String(reader.result),
        mime: file.type || "image/png",
      });
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export const EMPTY_PREVIEW: SchoolProfilePreviewState = {
  name: "",
  logoUrl: null,
  region: "",
  division: "",
  subdivision: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  schoolType: "",
  schoolCategory: "",
};

interface SchoolProfileEditorProps {
  onPreviewChange?: (data: SchoolProfilePreviewState) => void;
  /** Extra actions below the form (e.g. SetupFooter or Save button). */
  footer?: (ctx: {
    saving: boolean;
    error: string;
    success: string;
    setError: (v: string) => void;
    setSuccess: (v: string) => void;
    setSaving: (v: boolean) => void;
    persistProfile: () => Promise<void>;
    validateRequired: () => string | null;
    name: string;
  }) => React.ReactNode;
}

/** Shared school profile form for setup and School Management. */
export function SchoolProfileEditor({
  onPreviewChange,
  footer,
}: SchoolProfileEditorProps) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [name, setName] = React.useState("");
  const [shortCode, setShortCode] = React.useState("");
  const [schoolType, setSchoolType] = React.useState("");
  const [educationSystem, setEducationSystem] = React.useState<string>(
    EDUCATION_SYSTEMS[0],
  );
  const [schoolCategory, setSchoolCategory] = React.useState("");

  const [region, setRegion] = React.useState("");
  const [division, setDivision] = React.useState("");
  const [subdivision, setSubdivision] = React.useState("");
  const [address, setAddress] = React.useState("");

  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [website, setWebsite] = React.useState("");

  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [stampPreview, setStampPreview] = React.useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = React.useState<string | null>(
    null,
  );

  const [pendingLogo, setPendingLogo] = React.useState<PendingAsset | null>(
    null,
  );
  const [pendingStamp, setPendingStamp] = React.useState<PendingAsset | null>(
    null,
  );
  const [pendingSignature, setPendingSignature] =
    React.useState<PendingAsset | null>(null);

  const previewLogo = pendingLogo?.preview ?? logoPreview;

  React.useEffect(() => {
    onPreviewChange?.({
      name,
      logoUrl: previewLogo,
      region,
      division,
      subdivision,
      address,
      phone,
      email,
      website,
      schoolType,
      schoolCategory,
    });
  }, [
    name,
    previewLogo,
    region,
    division,
    subdivision,
    address,
    phone,
    email,
    website,
    schoolType,
    schoolCategory,
    onPreviewChange,
  ]);

  function applyProfile(profile: SchoolProfile) {
    setName(profile.name);
    setShortCode(profile.short_code || "");
    setSchoolType(profile.school_type ?? "");
    setEducationSystem(profile.education_system || EDUCATION_SYSTEMS[0]);
    setSchoolCategory(profile.school_category ?? "");
    setRegion(profile.region ?? "");
    setDivision(profile.division ?? "");
    setSubdivision(profile.subdivision ?? "");
    setAddress(profile.address ?? "");
    setPhone(profile.phone ?? "");
    setEmail(profile.email ?? "");
    setWebsite(profile.website ?? "");
    setLogoPreview(profile.logo_url);
    setStampPreview(profile.stamp_url);
    setSignaturePreview(profile.signature_url);
    setPendingLogo(null);
    setPendingStamp(null);
    setPendingSignature(null);
  }

  React.useEffect(() => {
    void (async () => {
      try {
        const result = await fetchSchoolProfile();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        applyProfile(result.profile);
      } catch {
        setError("Could not load school profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleAsset(
    file: File,
    setPending: (v: PendingAsset) => void,
    setPreview: (v: string) => void,
  ) {
    try {
      const { dataUrl, mime } = await readFileAsDataUrl(file);
      setPending({ base64: dataUrl, mimeType: mime, preview: dataUrl });
      setPreview(dataUrl);
    } catch {
      setError("Could not read the selected image.");
    }
  }

  function buildPayload(): UpdateSchoolProfileInput {
    return {
      name,
      email,
      phone,
      address,
      short_code: shortCode.trim().toUpperCase(),
      school_type: schoolType || null,
      education_system: educationSystem || null,
      school_category: schoolCategory || null,
      region: region || null,
      division: division || null,
      subdivision: subdivision || null,
      website: website || null,
      logoBase64: pendingLogo?.base64 ?? null,
      logoMimeType: pendingLogo?.mimeType,
      stampBase64: pendingStamp?.base64 ?? null,
      stampMimeType: pendingStamp?.mimeType,
      signatureBase64: pendingSignature?.base64 ?? null,
      signatureMimeType: pendingSignature?.mimeType,
    };
  }

  function validateRequired(): string | null {
    if (!name.trim()) return "School name is required.";
    if (!shortCode.trim()) return "School short code is required.";
    if (!region.trim()) return "Region is required.";
    if (!division.trim()) return "Division is required.";
    if (!subdivision.trim()) return "Subdivision is required.";
    if (!address.trim()) return "Address is required.";
    return null;
  }

  async function persistProfile() {
    const result = await updateSchoolProfile(buildPayload());
    if (!result.ok) throw new Error(result.error);
    applyProfile(result.profile);
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading school profile…</p>;
  }

  return (
    <>
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

      <div className="space-y-5">
        <FormSection
          title="School Information"
          description="Core identity used across reports and official documents."
        >
          <FormField
            label="School Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Greenfield High School"
          />
          <FormField
            label="School Short Code"
            required
            value={shortCode}
            onChange={(e) =>
              setShortCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 10),
              )
            }
            placeholder="GBHSB"
            hint="Used in student IDs. Letters and numbers only, max 10. Unique across schools."
          />
          <FormSelect
            label="School Type"
            options={SCHOOL_TYPES}
            value={schoolType}
            onChange={(e) => setSchoolType(e.target.value)}
            placeholder="Select school type"
          />
          <FormSelect
            label="Education System"
            options={EDUCATION_SYSTEMS}
            value={educationSystem}
            onChange={(e) => setEducationSystem(e.target.value)}
            placeholder="Select education system"
          />
          <FormSelect
            label="School Category"
            options={SCHOOL_CATEGORIES}
            value={schoolCategory}
            onChange={(e) => setSchoolCategory(e.target.value)}
            placeholder="Select category"
            fullWidth
          />
        </FormSection>

        <FormSection
          title="Location Information"
          description="Administrative location for your campus."
        >
          <FormField
            label="Region"
            required
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="e.g. Centre"
          />
          <FormField
            label="Division"
            required
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            placeholder="e.g. Mfoundi"
          />
          <FormField
            label="Subdivision"
            required
            value={subdivision}
            onChange={(e) => setSubdivision(e.target.value)}
            placeholder="e.g. Yaoundé I"
          />
          <FormField
            label="Address"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, quarter, city"
          />
        </FormSection>

        <FormSection
          title="Contact Information"
          description="How parents and partners can reach the school."
        >
          <FormField
            label="Phone Number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+237 6XX XXX XXX"
          />
          <FormField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="office@school.edu"
          />
          <FormField
            label="Website"
            type="url"
            fullWidth
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://www.school.edu"
          />
        </FormSection>

        <FormSection
          title="School Branding"
          description="Assets used on report cards, letters, and official documents."
        >
          <FileUploadField
            label="School Logo"
            hint="Appears on dashboards and documents."
            previewUrl={previewLogo}
            onFile={(file) =>
              void handleAsset(file, setPendingLogo, setLogoPreview)
            }
          />
          <FileUploadField
            label="School Stamp"
            hint="Official stamp for stamped documents."
            previewUrl={pendingStamp?.preview ?? stampPreview}
            onFile={(file) =>
              void handleAsset(file, setPendingStamp, setStampPreview)
            }
          />
          <FileUploadField
            label="Principal Signature"
            hint="Used when generating signed reports."
            previewUrl={pendingSignature?.preview ?? signaturePreview}
            onFile={(file) =>
              void handleAsset(file, setPendingSignature, setSignaturePreview)
            }
          />
        </FormSection>

        {footer?.({
          saving,
          error,
          success,
          setError,
          setSuccess,
          setSaving,
          persistProfile,
          validateRequired,
          name,
        })}
      </div>
    </>
  );
}
