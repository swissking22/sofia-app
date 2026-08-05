import React from "react";
import { useRouter } from "next/router";
import { SetupFooter } from "../../components/setup";
import {
  SetupShell,
  useSetupProgress,
} from "../../components/setup/SetupShell";
import { AcademicStructureManager } from "../../components/school/AcademicStructureManager";
import { canContinueStructure } from "../../lib/academic-structure";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
} from "../../lib/setup";

export default function AcademicStructureSetupPage() {
  return (
    <SetupShell stepId="academic-structure">
      <AcademicStructureSetupForm />
    </SetupShell>
  );
}

function AcademicStructureSetupForm() {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();
  const [draftSaving, setDraftSaving] = React.useState(false);

  return (
    <AcademicStructureManager
      footer={({ data, saving, setSaving, setError, setSuccess }) => (
        <SetupFooter
          stepId="academic-structure"
          saving={saving}
          draftSaving={draftSaving}
          onSaveDraft={() => {
            void (async () => {
              setError("");
              setSuccess("");
              setDraftSaving(true);
              try {
                const draft = await saveSetupDraft("academic-structure");
                if (!draft.ok) {
                  setError(draft.error);
                  return;
                }
                await refreshProgress();
                setSuccess("Draft saved.");
              } finally {
                setDraftSaving(false);
              }
            })();
          }}
          onContinue={() => {
            void (async () => {
              setError("");
              setSuccess("");
              if (!canContinueStructure(data)) {
                setError(
                  "Add at least one academic level, one section, and one class before continuing.",
                );
                return;
              }
              setSaving(true);
              try {
                const done = await completeSetupStep("academic-structure");
                if (!done.ok) {
                  setError(done.error);
                  return;
                }
                await refreshProgress();
                await router.push(getNextSetupHref("academic-structure"));
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
