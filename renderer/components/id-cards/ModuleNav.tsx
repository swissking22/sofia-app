import Link from "next/link";
import { useRouter } from "next/router";

const LINKS = [
  { href: "/students/id-cards", label: "Dashboard" },
  { href: "/students/id-cards/templates", label: "Templates" },
  { href: "/students/id-cards/templates/new", label: "Create template" },
  { href: "/students/id-cards/generate", label: "Generate cards" },
  { href: "/students/id-cards/issued", label: "Issued cards" },
  { href: "/students/id-cards/print-history", label: "Print history" },
  { href: "/students/id-cards/settings", label: "Card settings" },
];

export function IdCardModuleNav() {
  const router = useRouter();
  return (
    <nav className="mb-5 flex flex-wrap gap-2">
      {LINKS.map((link) => {
        const active =
          link.href === "/students/id-cards"
            ? router.pathname === link.href
            : router.pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              active
                ? "bg-(--sofia-primary) text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
