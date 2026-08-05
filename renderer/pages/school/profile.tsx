import React from "react";
import { AppShell } from "../../components/layout/AppShell";
import { SchoolProfilePreview } from "../../components/setup/SchoolProfilePreview";
import {
  EMPTY_PREVIEW,
  SchoolProfileEditor,
  type SchoolProfilePreviewState,
} from "../../components/school/SchoolProfileEditor";

export default function SchoolProfilePage() {
  const [preview, setPreview] =
    React.useState<SchoolProfilePreviewState>(EMPTY_PREVIEW);

  return (
    <AppShell
      title="School Profile"
      breadcrumb={["School Management", "School Profile"]}
      heading="School Profile"
      subtitle="Update your school identity, location, and branding."
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <SchoolProfileEditor
            onPreviewChange={setPreview}
            footer={({
              saving,
              setError,
              setSuccess,
              setSaving,
              persistProfile,
              validateRequired,
            }) => (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
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
                        setSuccess("School profile saved.");
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Could not save profile.",
                        );
                      } finally {
                        setSaving(false);
                      }
                    })();
                  }}
                  className="cursor-pointer rounded-xl bg-(--sofia-primary) px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            )}
          />
        </div>
        <div className="hidden xl:block">
          <div className="sticky top-4">
            <SchoolProfilePreview data={preview} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
