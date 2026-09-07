import React from "react";
import {
  Add01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";
import { TableActionGroup, TableIconButton } from "../ui/TableActions";
export { TableSelectionBar } from "../students/ui";

interface SetupTabsProps {
  tabs: Array<{ id: string; label: string }>;
  activeId: string;
  onChange: (id: string) => void;
}

export function SetupTabs({ tabs, activeId, onChange }: SetupTabsProps) {
  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition ${
              active
                ? "bg-(--sofia-primary) text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

interface DataTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  onAdd: () => void;
  addLabel: string;
}

export function DataTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  onAdd,
  addLabel,
}: DataTableToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="relative block w-full max-w-sm">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <Icon icon={Search01Icon} size={16} />
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15"
        />
      </label>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-(--sofia-primary) px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-(--sofia-primary-dark)"
      >
        <Icon icon={Add01Icon} size={16} />
        {addLabel}
      </button>
    </div>
  );
}

interface DataTableProps {
  headers: (string | React.ReactNode)[];
  children: React.ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  selectionBar?: React.ReactNode;
}

export function DataTable({
  headers,
  children,
  emptyMessage = "No records yet.",
  isEmpty,
  selectionBar,
}: DataTableProps) {
  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={typeof h === "string" ? h : `col-${i}`}
                    className="px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isEmpty ? (
                <tr>
                  <td
                    colSpan={headers.length + 1}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                children
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selectionBar}
    </>
  );
}

interface RowActionsProps {
  onEdit: () => void;
  onDelete: () => void;
}

export function RowActions({ onEdit, onDelete }: RowActionsProps) {
  return (
    <TableActionGroup>
      <TableIconButton icon={PencilEdit01Icon} label="Edit" onClick={onEdit} />
      <TableIconButton
        icon={Delete02Icon}
        label="Delete"
        tone="danger"
        onClick={onDelete}
      />
    </TableActionGroup>
  );
}

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function SetupModal({
  title,
  open,
  onClose,
  children,
  footer,
}: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
