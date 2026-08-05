import { useEffect } from "react";
import { useRouter } from "next/router";
import { fetchSetupProgress } from "../../lib/setup";

/** Redirect to the first incomplete setup step. */
export default function SetupIndexPage() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      try {
        const progress = await fetchSetupProgress();
        await router.replace(progress.nextHref);
      } catch {
        await router.replace("/setup/school-profile");
      }
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] text-sm text-slate-500">
      Opening setup…
    </div>
  );
}
