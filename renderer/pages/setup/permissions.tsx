import React from "react";
import { useRouter } from "next/router";

/** Legacy module-matrix page — redirect to action-level roles. */
export default function PermissionsRedirectPage() {
  const router = useRouter();

  React.useEffect(() => {
    void router.replace("/setup/roles");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] text-sm text-slate-500">
      Redirecting to roles…
    </div>
  );
}
