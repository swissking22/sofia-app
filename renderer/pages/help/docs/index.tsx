import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Search01Icon, BookOpen01Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "../../../components/layout/AppShell";
import { Icon } from "../../../components/ui/Icon";
import { selectClass } from "../../../components/students/ui";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  getHelpArticle,
  searchHelpArticles,
  type HelpArticle,
  type HelpBlock,
} from "../../../lib/help-docs";

export default function HelpDocsPage() {
  const router = useRouter();
  const articleId =
    typeof router.query.article === "string" ? router.query.article : "";
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");

  const filtered = React.useMemo(() => {
    let list = searchHelpArticles(query);
    if (category !== "all") {
      list = list.filter((a) => a.category === category);
    }
    return list;
  }, [query, category]);

  const selected =
    (articleId ? getHelpArticle(articleId) : null) ||
    filtered[0] ||
    HELP_ARTICLES[0];

  function openArticle(id: string) {
    void router.replace(
      { pathname: "/help/docs", query: { article: id } },
      undefined,
      { shallow: true },
    );
  }

  return (
    <AppShell
      title="Documentation"
      breadcrumb={["Help & Support", "Documentation"]}
      heading="Documentation"
      subtitle="Guides for day-to-day Sofia workflows. Search or browse by topic."
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block min-w-55 flex-1 text-xs font-medium text-slate-500">
          Search
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Icon icon={Search01Icon} size={16} />
            </span>
            <input
              className={`${selectClass} w-full pl-9`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. sync, fees, attendance…"
            />
          </div>
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Category
          <select
            className={`${selectClass} mt-1 min-w-45`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {HELP_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <Link
          href="/help/support"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-(--sofia-primary) hover:text-(--sofia-primary)"
        >
          Contact support
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Topics ({filtered.length})
          </div>
          <ul className="max-h-[70vh] overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-slate-500">
                No articles match your search.
              </li>
            ) : (
              filtered.map((a) => {
                const active = selected?.id === a.id;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => openArticle(a.id)}
                      className={`mb-0.5 w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition ${
                        active
                          ? "bg-(--sofia-primary) text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="text-sm font-medium">{a.title}</div>
                      <div
                        className={`mt-0.5 text-[11px] ${
                          active ? "text-white/80" : "text-slate-400"
                        }`}
                      >
                        {a.category}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        <article className="min-h-100 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          {selected ? (
            <ArticleBody article={selected} />
          ) : (
            <p className="text-sm text-slate-500">Select a topic.</p>
          )}
        </article>
      </div>
    </AppShell>
  );
}

function ArticleBody({ article }: { article: HelpArticle }) {
  return (
    <>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--sofia-primary)/10 text-(--sofia-primary)">
          <Icon icon={BookOpen01Icon} size={20} />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {article.category}
          </p>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {article.title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{article.summary}</p>
        </div>
      </div>
      <div className="space-y-4 text-sm leading-relaxed text-slate-700">
        {article.blocks.map((block, i) => (
          <BlockView key={i} block={block} />
        ))}
      </div>
    </>
  );
}

function BlockView({ block }: { block: HelpBlock }) {
  if (block.type === "p") {
    return <p>{block.text}</p>;
  }
  if (block.type === "tip") {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-amber-900">
        <span className="font-semibold">Tip: </span>
        {block.text}
      </div>
    );
  }
  if (block.type === "steps") {
    return (
      <ol className="list-decimal space-y-2 pl-5">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }
  if (block.type === "bullets") {
    return (
      <ul className="list-disc space-y-2 pl-5">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <Link
      href={block.href}
      className="inline-flex font-semibold text-(--sofia-primary) hover:underline"
    >
      {block.label} →
    </Link>
  );
}
