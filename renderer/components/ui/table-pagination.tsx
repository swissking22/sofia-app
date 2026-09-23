import React from "react";

export const TABLE_PAGE_SIZE = 10;

export function flattenTableRows(
  children: React.ReactNode,
): React.ReactElement[] {
  return React.Children.toArray(children).filter(
    React.isValidElement,
  ) as React.ReactElement[];
}

/** Client-side page of table body rows (typically `<tr>` elements). */
export function useTablePagination(
  children: React.ReactNode,
  pageSize: number = TABLE_PAGE_SIZE,
) {
  const rows = React.useMemo(() => flattenTableRows(children), [children]);
  const [page, setPage] = React.useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize) || 1);

  React.useEffect(() => {
    setPage(1);
  }, [rows.length, pageSize]);

  React.useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), pageCount));
  }, [pageCount]);

  const start = (page - 1) * pageSize;
  const visible = rows.slice(start, start + pageSize);

  return {
    page,
    setPage,
    pageCount,
    pageSize,
    total: rows.length,
    visible,
    showControls: rows.length > pageSize,
  };
}

export function TablePaginationBar({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
      <span>
        Showing <strong className="text-slate-900">{from}</strong>–
        <strong className="text-slate-900">{to}</strong> of{" "}
        <strong className="text-slate-900">{total}</strong>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span className="min-w-16 text-center tabular-nums">
          Page {page} / {pageCount}
        </span>
        <button
          type="button"
          className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/**
 * Wraps a standard list table shell and paginates row children (10 per page).
 * Pass the `<thead>…</thead>` as `head` and `<tr>` rows as `children`.
 */
export function ClientPaginatedTable({
  head,
  children,
  pageSize = TABLE_PAGE_SIZE,
  tableClassName = "min-w-full text-left text-sm",
  wrapClassName = "overflow-hidden rounded-xl border border-slate-200 bg-white",
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  pageSize?: number;
  tableClassName?: string;
  wrapClassName?: string;
}) {
  const {
    page,
    setPage,
    pageCount,
    total,
    visible,
    pageSize: size,
    showControls,
  } = useTablePagination(children, pageSize);

  return (
    <>
      <div className={wrapClassName}>
        <div className="overflow-x-auto">
          <table className={tableClassName}>
            {head}
            <tbody className="divide-y divide-slate-100">{visible}</tbody>
          </table>
        </div>
      </div>
      {showControls ? (
        <TablePaginationBar
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={size}
          onPageChange={setPage}
        />
      ) : null}
    </>
  );
}
