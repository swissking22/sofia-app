import React from "react";
import { useRouter } from "next/router";
import {
  SetupShell,
  useSetupProgress,
} from "../../components/setup/SetupShell";
import { SetupFooter } from "../../components/setup";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
  type SetupStepId,
} from "../../lib/setup";

interface PlaceholderSetupPageProps {
  stepId: SetupStepId;
}

/** Temporary step page until the detailed form structure is provided. */
export function PlaceholderSetupPage({ stepId }: PlaceholderSetupPageProps) {
  return (
    <SetupShell stepId={stepId}>
      <PlaceholderBody stepId={stepId} />
    </SetupShell>
  );
}

function PlaceholderBody({ stepId }: { stepId: SetupStepId }) {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();
  const [saving, setSaving] = React.useState(false);
  const [draftSaving, setDraftSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");

  async function handleSaveDraft() {
    setDraftSaving(true);
    setMessage("");
    try {
      await saveSetupDraft(stepId);
      await refreshProgress();
      setMessage("Draft saved. Form fields for this step will be added next.");
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleContinue() {
    setSaving(true);
    setMessage("");
    try {
      await completeSetupStep(stepId);
      await refreshProgress();
      await router.push(getNextSetupHref(stepId));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-700">
          This step’s form structure is coming next.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          You can Save Draft, Continue when ready, or Skip for now (skipped
          steps stay incomplete until you finish them).
        </p>
        {message ? (
          <p className="mt-4 text-sm text-emerald-600">{message}</p>
        ) : null}
      </div>
      <SetupFooter
        stepId={stepId}
        onSaveDraft={() => void handleSaveDraft()}
        onContinue={() => void handleContinue()}
        saving={saving}
        draftSaving={draftSaving}
      />
    </div>
  );
}
