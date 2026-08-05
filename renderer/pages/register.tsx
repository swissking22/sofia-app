import React from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ImageAdd01Icon,
  Upload01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "../components/ui/Icon";
import { AuthSplitLayout } from "../components/auth/AuthSplitLayout";
import { AuthField, AuthSelect } from "../components/auth/AuthField";
import { StepIndicator } from "../components/auth/StepIndicator";
import {
  authGetSetupState,
  authRegisterAdmin,
  authRegisterSchool,
} from "../lib/auth";
import { COUNTRY_NAMES, applyDialCode, getDialCode } from "../lib/countries";

type Step = 1 | 2 | 3;

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [checking, setChecking] = React.useState(true);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  // Step 1 — school details
  const [schoolName, setSchoolName] = React.useState("");
  const [schoolEmail, setSchoolEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [address, setAddress] = React.useState("");

  // Step 2 — logo
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [logoBase64, setLogoBase64] = React.useState<string | null>(null);
  const [logoMimeType, setLogoMimeType] = React.useState("image/png");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Step 3 — admin (+ schoolId after school is saved)
  const [schoolId, setSchoolId] = React.useState<string | null>(null);
  const [adminEmail, setAdminEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  React.useEffect(() => {
    void (async () => {
      const state = await authGetSetupState();
      if (!state.needsSetup) {
        await router.replace("/login");
        return;
      }

      // Resume: school already created → jump to admin step
      if (state.pendingSchool) {
        setSchoolId(state.pendingSchool.id);
        setSchoolName(state.pendingSchool.name);
        setSchoolEmail(state.pendingSchool.email);
        setPhone(state.pendingSchool.phone ?? "");
        setCountry(state.pendingSchool.country ?? "");
        setAddress(state.pendingSchool.address ?? "");
        setAdminEmail(state.pendingSchool.email);
        setStep(3);
      }

      setChecking(false);
    })();
  }, [router]);

  function clearError() {
    setError("");
  }

  function handleCountryChange(nextCountry: string) {
    const previousDial = getDialCode(country);
    const nextDial = getDialCode(nextCountry);
    setCountry(nextCountry);

    if (!nextDial) return;
    setPhone((current) => applyDialCode(current, nextDial, previousDial));
  }

  function goNextFromStep1(e: React.FormEvent) {
    e.preventDefault();
    clearError();

    if (!schoolName.trim()) {
      setError("School name is required.");
      return;
    }

    if (!phone.trim()) {
      setError("Phone is required.");
      return;
    }

    if (!address.trim()) {
      setError("Address is required.");
      return;
    }

    setAdminEmail((prev) => prev || schoolEmail.trim());
    setStep(2);
  }

  async function goNextFromStep2(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setLoading(true);

    try {
      // Persist school + logo before moving to admin
      const result = await authRegisterSchool({
        schoolName,
        schoolEmail,
        phone,
        country,
        address,
        logoBase64,
        logoMimeType,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSchoolId(result.school.id);
      setStep(3);
    } catch {
      setError("Could not save school. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitAdmin(e: React.FormEvent) {
    e.preventDefault();
    clearError();

    if (!schoolId) {
      setError("School is missing. Go back and create the school first.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const result = await authRegisterAdmin({
        schoolId,
        email: adminEmail,
        password,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      await router.push("/home");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function onLogoSelected(file: File | undefined) {
    clearError();
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG, or WebP).");
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo must be 2MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setLogoPreview(dataUrl);
      setLogoBase64(dataUrl);
      setLogoMimeType(file.type || "image/png");
    };
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    setLogoPreview(null);
    setLogoBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (checking) {
    return (
      <AuthSplitLayout>
        <p className="text-sm text-slate-500">Loading…</p>
      </AuthSplitLayout>
    );
  }

  const titles: Record<Step, { title: string; subtitle: string }> = {
    1: {
      title: "Create your school",
      subtitle: "Start with the basic details for your institution.",
    },
    2: {
      title: "School branding",
      subtitle: "Upload a logo and confirm contact details.",
    },
    3: {
      title: "Create admin account",
      subtitle: "This account manages your SOFIA workspace.",
    },
  };

  const leftHeadlines: Record<Step, React.ReactNode> = {
    1: (
      <>
        Start with your{" "}
        <span className="relative inline-block px-1">
          school
          <svg
            className="pointer-events-none absolute -inset-x-2 -inset-y-1 h-[calc(100%+8px)] w-[calc(100%+16px)] text-orange-400"
            viewBox="0 0 120 40"
            fill="none"
            aria-hidden
          >
            <ellipse
              cx="60"
              cy="20"
              rx="56"
              ry="16"
              stroke="currentColor"
              strokeWidth="2.5"
              className="opacity-90"
            />
          </svg>
        </span>{" "}
        details
      </>
    ),
    2: (
      <>
        Add your school{" "}
        <span className="relative inline-block px-1">
          brand
          <svg
            className="pointer-events-none absolute -inset-x-2 -inset-y-1 h-[calc(100%+8px)] w-[calc(100%+16px)] text-orange-400"
            viewBox="0 0 120 40"
            fill="none"
            aria-hidden
          >
            <ellipse
              cx="60"
              cy="20"
              rx="56"
              ry="16"
              stroke="currentColor"
              strokeWidth="2.5"
              className="opacity-90"
            />
          </svg>
        </span>
      </>
    ),
    3: (
      <>
        Create your{" "}
        <span className="relative inline-block px-1">
          admin
          <svg
            className="pointer-events-none absolute -inset-x-2 -inset-y-1 h-[calc(100%+8px)] w-[calc(100%+16px)] text-orange-400"
            viewBox="0 0 120 40"
            fill="none"
            aria-hidden
          >
            <ellipse
              cx="60"
              cy="20"
              rx="56"
              ry="16"
              stroke="currentColor"
              strokeWidth="2.5"
              className="opacity-90"
            />
          </svg>
        </span>{" "}
        account
      </>
    ),
  };

  return (
    <>
      <Head>
        <title>Create an account — SOFIA</title>
      </Head>

      <AuthSplitLayout headline={leftHeadlines[step]}>
        <StepIndicator current={step} />

        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          {titles[step].title}
        </h2>
        <p className="mt-2 text-sm text-slate-500">{titles[step].subtitle}</p>

        {error ? (
          <div className="mt-6 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        {/* —— Step 1: School details —— */}
        {step === 1 ? (
          <form onSubmit={goNextFromStep1} className="mt-8">
            <AuthField
              label="School Name"
              required
              autoFocus
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="Greenfield High School"
            />
            <AuthField
              label="School Email"
              type="email"
              value={schoolEmail}
              onChange={(e) => setSchoolEmail(e.target.value)}
              placeholder="office@school.edu"
            />
            <AuthSelect
              label="Country"
              options={COUNTRY_NAMES}
              value={country}
              onChange={(e) => handleCountryChange(e.target.value)}
              placeholder="Select a country"
            />
            <AuthField
              label="Phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 0100"
            />
            <AuthField
              label="Address"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Education Ave, City"
            />

            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-[#2f6bff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-600"
            >
              Continue
            </button>
          </form>
        ) : null}

        {/* —— Step 2: Logo + review —— */}
        {step === 2 ? (
          <form onSubmit={goNextFromStep2} className="mt-8">
            <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-slate-800">{schoolName}</p>
              <p className="mt-0.5">{schoolEmail}</p>
              {country ? <p className="mt-0.5">{country}</p> : null}
              {phone ? <p className="mt-0.5">{phone}</p> : null}
              {address ? <p className="mt-0.5">{address}</p> : null}
            </div>

            <p className="mb-2 text-sm font-medium text-slate-700">
              School logo{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => onLogoSelected(e.target.files?.[0])}
            />

            {logoPreview ? (
              <div className="mb-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
                <img
                  src={logoPreview}
                  alt="School logo preview"
                  className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    Logo ready
                  </p>
                  <p className="text-xs text-slate-500">
                    Shown on your dashboard
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearLogo}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Remove logo"
                >
                  <Icon icon={Cancel01Icon} size={18} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mb-6 flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-slate-500 transition hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-600"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <Icon icon={ImageAdd01Icon} size={22} />
                </span>
                <span className="text-sm font-medium">
                  Click to upload logo
                </span>
                <span className="text-xs text-slate-400">
                  PNG, JPG, or WebP · max 2MB
                </span>
              </button>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setStep(1);
                }}
                className="w-1/3 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex w-2/3 items-center justify-center gap-2 rounded-lg bg-[#2f6bff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon icon={Upload01Icon} size={16} />
                {loading ? "Saving school…" : "Save school & continue"}
              </button>
            </div>
          </form>
        ) : null}

        {/* —— Step 3: Admin account —— */}
        {step === 3 ? (
          <form onSubmit={submitAdmin} className="mt-8">
            <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-800">
              Setting up admin for{" "}
              <span className="font-semibold">{schoolName}</span>
            </div>

            <AuthField
              label="Admin Email"
              type="email"
              required
              autoFocus
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@school.edu"
            />
            <AuthField
              label="Password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
            <AuthField
              label="Confirm Password"
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your password"
            />

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-[#2f6bff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create admin account"}
            </button>

            {!schoolId ? (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="mt-3 w-full text-center text-sm font-medium text-blue-600 hover:underline"
              >
                Back to branding
              </button>
            ) : null}
          </form>
        ) : null}

        <p className="mt-5 text-center text-sm text-slate-500">
          Already Have An Account?{" "}
          <Link
            href="/login"
            className="font-semibold text-blue-600 hover:underline"
          >
            Log In
          </Link>
        </p>
      </AuthSplitLayout>
    </>
  );
}
