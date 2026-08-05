import React from "react";
import { useRouter } from "next/router";
import { SetupFooter } from "../../components/setup";
import {
  SetupShell,
  useSetupProgress,
} from "../../components/setup/SetupShell";
import { SchoolProfilePreview } from "../../components/setup/SchoolProfilePreview";
import {
  EMPTY_PREVIEW,
  SchoolProfileEditor,
  type SchoolProfilePreviewState,
} from "../../components/school/SchoolProfileEditor";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
} from "../../lib/setup";

export default function SchoolProfileSetupPage() {
  const [preview, setPreview] =
    React.useState<SchoolProfilePreviewState>(EMPTY_PREVIEW);

  return (
    <SetupShell
      stepId="school-profile"
      aside={<SchoolProfilePreview data={preview} />}
    >
      <SchoolProfileSetupForm onPreviewChange={setPreview} />
    </SetupShell>
  );
}

function SchoolProfileSetupForm({
  onPreviewChange,
}: {
  onPreviewChange: (data: SchoolProfilePreviewState) => void;
}) {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();
  const [draftSaving, setDraftSaving] = React.useState(false);

  return (
    <SchoolProfileEditor
      onPreviewChange={onPreviewChange}
      footer={({
        saving,
        setError,
        setSuccess,
        setSaving,
        persistProfile,
        validateRequired,
        name,
      }) => (
        <SetupFooter
          stepId="school-profile"
          saving={saving}
          draftSaving={draftSaving}
          onSaveDraft={() => {
            void (async () => {
              setError("");
              setSuccess("");
              if (!name.trim()) {
                setError("School name is required to save a draft.");
                return;
              }
              setDraftSaving(true);
              try {
                await persistProfile();
                const draft = await saveSetupDraft("school-profile");
                if (!draft.ok) {
                  setError(draft.error);
                  return;
                }
                await refreshProgress();
                setSuccess("Draft saved.");
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not save draft.",
                );
              } finally {
                setDraftSaving(false);
              }
            })();
          }}
          onContinue={() => {
            void (async () => {
              setError("");
              setSuccess("");
              const validationError = validateRequired();
              if (validationError) {
                setError(validationError);
                return;
              }
              setSaving(true);
              try {
                await persistProfile();
                const done = await completeSetupStep("school-profile");
                if (!done.ok) {
                  setError(done.error);
                  return;
                }
                await refreshProgress();
                await router.push(getNextSetupHref("school-profile"));
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not continue.",
                );
              } finally {
                setSaving(false);
              }
            })();
          }}
        />
      )}
    />
  );
}
