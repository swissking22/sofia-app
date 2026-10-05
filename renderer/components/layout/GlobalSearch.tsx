import React from "react";
import { useRouter } from "next/router";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";
import { NAV_SECTIONS } from "../../lib/navigation";

export type SearchEntry = {
  id: string;
  label: string;
  href: string;
  group: string;
};

/** Flatten sidebar nav into searchable destinations (skips comingSoon). */
export function getSearchablePages(): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.comingSoon) continue;
      if (item.href) {
        entries.push({
          id: item.id,
          label: item.label,
          href: item.href,
          group: section.label,
        });
      }
      for (const child of item.children ?? []) {
        if (child.comingSoon) continue;
        entries.push({
          id: child.id,
          label: child.label,
          href: child.href,
          group: item.label,
        });
      }
    }
  }
  return entries;
}

function matchScore(query: string, label: string, group: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const hay = `${label} ${group}`.toLowerCase();
  if (label.toLowerCase().startsWith(q)) return 100;
  if (hay.includes(q)) return 50;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.every((t) => hay.includes(t))) return 25;
  return 0;
}

/** Header search pill + Ctrl/Cmd+K palette that navigates to app pages. */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pages = React.useMemo(() => getSearchablePages(), []);

  const results = React.useMemo(() => {
    const q = query.trim();
    if (!q) return pages.slice(0, 12);
    return pages
      .map((p) => ({ page: p, score: matchScore(q, p.label, p.group) }))
      .filter((r) => r.score > 0)
      .sort(
        (a, b) => b.score - a.score || a.page.label.localeCompare(b.page.label),
      )
      .slice(0, 12)
      .map((r) => r.page);
  }, [pages, query]);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const go = React.useCallback(
    (href: string) => {
      close();
      void router.push(href);
    },
    [close, router],
  );

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isPalette =
        (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey);
      if (isPalette) {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query, results.length]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto flex w-full max-w-md cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-left text-sm text-slate-400 transition hover:border-slate-300 hover:bg-white"
        aria-label="Search pages"
      >
        <Icon icon={Search01Icon} size={15} />
        <span className="flex-1">Search…</span>
        <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          Ctrl K
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh] print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Search pages"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
              <Icon icon={Search01Icon} size={16} className="text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Go to a page…"
                className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIndex((i) =>
                      results.length ? (i + 1) % results.length : 0,
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIndex((i) =>
                      results.length
                        ? (i - 1 + results.length) % results.length
                        : 0,
                    );
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const hit = results[activeIndex];
                    if (hit) go(hit.href);
                  }
                }}
              />
              <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">
                Esc
              </kbd>
            </div>
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-slate-500">
                  No matching pages.
                </li>
              ) : (
                results.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                        index === activeIndex
                          ? "bg-(--sofia-primary)/8 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(item.href)}
                    >
                      <span className="font-medium">{item.label}</span>
                      <span className="truncate text-xs text-slate-400">
                        {item.group}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
