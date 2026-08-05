import React from "react";

interface AuthSplitLayoutProps {
  children: React.ReactNode;
  headline?: React.ReactNode;
}

/**
 * Split-pane auth shell:
 * left = brand + illustration, right = step form.
 * Always two columns in the desktop app (no lg-only hide).
 */
export function AuthSplitLayout({
  children,
  headline = (
    <>
      Simplify{" "}
      <span className="relative inline-block px-1">
        School
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
            strokeLinecap="round"
            className="opacity-90"
          />
        </svg>
      </span>{" "}
      And Student Management
    </>
  ),
}: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-screen w-full bg-white">
      {/* Left — illustration + copy (always visible) */}
      <aside className="relative flex w-[46%] min-w-[320px] shrink-0 flex-col overflow-hidden bg-[#dceafc]">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 900'%3E%3Cpath fill='%23ffffff' fill-opacity='0.55' d='M0 180C120 80 240 40 400 120C560 200 680 160 800 80V0H0V180Z'/%3E%3Cpath fill='%23ffffff' fill-opacity='0.4' d='M0 420C160 340 280 480 440 400C600 320 700 380 800 300V900H0V420Z'/%3E%3Cpath fill='%23ffffff' fill-opacity='0.35' d='M0 700C140 620 300 760 460 680C620 600 720 640 800 560V900H0V700Z'/%3E%3C/svg%3E")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />

        <div className="relative z-10 flex h-full min-h-screen flex-1 flex-col px-10 pb-8 pt-10 xl:px-14">
          <div className="flex items-center gap-2.5 animate-[fadeIn_0.5s_ease-out]">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white shadow-md shadow-blue-600/30">
              S
            </div>
            <span
              className="text-2xl font-semibold tracking-tight text-blue-700"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              SOFIA
            </span>
          </div>

          <h1 className="mt-12 max-w-md text-4xl font-bold leading-[1.15] tracking-tight text-blue-800 xl:text-[2.75rem] animate-[fadeInUp_0.6s_ease-out]">
            {headline}
          </h1>

          <p className="mt-4 max-w-sm text-sm leading-relaxed text-blue-700/70 animate-[fadeInUp_0.65s_ease-out]">
            Set up your school workspace offline — details, branding, then your
            admin account.
          </p>

          <div className="mt-auto flex flex-1 items-end justify-center pb-4 pt-10 animate-[fadeIn_0.8s_ease-out_0.15s_both]">
            <AuthHeroArt />
          </div>
        </div>
      </aside>

      {/* Right — step-by-step form */}
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-white px-8 py-10 xl:px-16">
        <div className="w-full max-w-105 animate-[fadeInUp_0.55s_ease-out]">
          {children}
        </div>
      </main>
    </div>
  );
}

/** Lightweight SVG illustration — offline-safe, no external assets. */
function AuthHeroArt() {
  return (
    <svg
      viewBox="0 0 420 280"
      className="h-auto w-full max-w-95"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <ellipse
        cx="210"
        cy="250"
        rx="140"
        ry="16"
        fill="#9ec0e8"
        opacity="0.45"
      />

      <rect x="150" y="200" width="130" height="14" rx="4" fill="#1e293b" />
      <rect x="165" y="188" width="100" height="14" rx="3" fill="#334155" />

      <circle cx="145" cy="95" r="28" fill="#fbbf24" />
      <circle cx="145" cy="95" r="22" fill="#fde68a" />
      <path
        d="M110 175c0-28 16-48 35-48s35 20 35 48v30H110v-30z"
        fill="#f59e0b"
      />
      <path d="M118 155h54v50H118z" fill="#ea580c" />
      <path
        d="M188 130c8-18 22-22 28-14 4 6-2 14-8 18l-12 8-8-12z"
        fill="#fde68a"
      />

      <circle cx="275" cy="100" r="26" fill="#64748b" />
      <circle cx="275" cy="100" r="20" fill="#cbd5e1" />
      <rect x="255" y="96" width="16" height="3" rx="1" fill="#0f172a" />
      <rect x="279" y="96" width="16" height="3" rx="1" fill="#0f172a" />
      <path d="M248 120h8v6h-8z" fill="#0f172a" />
      <path
        d="M240 180c0-26 16-44 35-44s35 18 35 44v28H240v-28z"
        fill="#1e293b"
      />
      <rect x="300" y="155" width="42" height="52" rx="4" fill="#fff" />
      <rect x="300" y="155" width="6" height="52" rx="2" fill="#3b82f6" />
      <path
        d="M312 168h22M312 178h18M312 188h20"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
    </svg>
  );
}
