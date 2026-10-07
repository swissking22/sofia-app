import React from "react";
import { useRouter } from "next/router";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";
import { NAV_SECTIONS, type NavSection } from "../../lib/navigation";
import {
  SEARCH_KIND_LABELS,
  searchGlobal,
  type GlobalSearchHit,
  type GlobalSearchKind,
} from "../../lib/global-search";
import { useDebouncedValue } from "../students/ui";

export type SearchEntry = {
  id: string;
  kind: GlobalSearchKind;
  label: string;
  subtitle: string;
  href: string;
  score: number;
};

/** Flatten sidebar nav into searchable destinations (skips comingSoon). */
export function getSearchablePages(
  sections: NavSection[] = NAV_SECTIONS,
): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      if (item.comingSoon) continue;
      if (item.href) {
        entries.push({
          id: `page:${item.id}`,
          kind: "page",
          label: item.label,
          subtitle: section.label,
          href: item.href,
          score: 0,
        });
      }
      for (const child of item.children ?? []) {
        if (child.comingSoon) continue;
        entries.push({
          id: `page:${child.id}`,
          kind: "page",
          label: child.label,
          subtitle: item.label,
          href: child.href,
          score: 0,
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
  if (label.toLowerCase() === q) return 100;
  if (label.toLowerCase().startsWith(q)) return 85;
  if (hay.includes(q)) return 45;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.every((t) => hay.includes(t))) return 30;
  return 0;
}

function mergeResults(
  pages: SearchEntry[],
  dbHits: GlobalSearchHit[],
  query: string,
  limit = 24,
): SearchEntry[] {
  const q = query.trim();
  const pageHits: SearchEntry[] = !q
    ? pages.slice(0, 10).map((p) => ({ ...p, score: 1 }))
    : pages
        .map((p) => ({
          ...p,
          score: matchScore(q, p.label, p.subtitle),
        }))
        .filter((p) => p.score > 0);

  const merged = [...dbHits.map((h) => ({ ...h })), ...pageHits];
  const seen = new Set<string>();
  const unique: SearchEntry[] = [];
  for (const hit of merged.sort(
    (a, b) =>
      b.score - a.score ||
      a.kind.localeCompare(b.kind) ||
      a.label.localeCompare(b.label),
  )) {
    if (seen.has(hit.id) || seen.has(hit.href + hit.label)) continue;
    seen.add(hit.id);
    seen.add(hit.href + hit.label);
    unique.push(hit);
    if (unique.length >= limit) break;
  }
  return unique;
}

/** Header search pill + Ctrl/Cmd+K palette: pages and school database records. */
export function GlobalSearch({ sections }: { sections?: NavSection[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebouncedValue(query, 220);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [dbHits, setDbHits] = React.useState<GlobalSearchHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pages = React.useMemo(
    () => getSearchablePages(sections ?? NAV_SECTIONS),
    [sections],
  );

  React.useEffect(() => {
    const q = debouncedQuery.trim();
    if (!open || q.length < 2) {
      setDbHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    void searchGlobal(q, 40).then((res) => {
      if (cancelled) return;
      setSearching(false);
      if (res.ok) setDbHits(res.data.hits);
      else setDbHits([]);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open]);

  const results = React.useMemo(
    () => mergeResults(pages, dbHits, query),
    [pages, dbHits, query],
  );

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setDbHits([]);
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
        aria-label="Search school data and pages"
      >
        <Icon icon={Search01Icon} size={15} />
        <span className="flex-1">Search students, staff, pages…</span>
        <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          Ctrl K
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-[10vh] print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Global search"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
              <Icon icon={Search01Icon} size={16} className="text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search names, IDs, classes, subjects, invoices…"
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
              {searching ? (
                <span className="text-[10px] font-medium text-slate-400">
                  Searching…
                </span>
              ) : (
                <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">
                  Esc
                </kbd>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto py-1">
              {results.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-slate-500">
                  {query.trim().length < 2
                    ? "Type at least 2 characters to search school data, or pick a page below when empty."
                    : searching
                      ? "Searching…"
                      : "No matching pages or records."}
                </li>
              ) : (
                results.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`flex w-full cursor-pointer items-start justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                        index === activeIndex
                          ? "bg-(--sofia-primary)/8 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(item.href)}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{item.label}</span>
                        {item.subtitle ? (
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {item.subtitle}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {SEARCH_KIND_LABELS[item.kind] ?? item.kind}
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
