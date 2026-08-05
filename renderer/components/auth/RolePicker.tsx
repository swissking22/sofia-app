import type { IconSvgElement } from "@hugeicons/react";
import { SchoolIcon, TeacherIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";

interface RoleOption {
  id: string;
  label: string;
  icon: IconSvgElement;
}

interface RolePickerProps {
  label?: string;
  options: RoleOption[];
  value: string;
  onChange: (id: string) => void;
}

/** Side-by-side role cards with radio indicator (reference signup UI). */
export function RolePicker({
  label = "Select a role to access tailored features.",
  options,
  value,
  onChange,
}: RolePickerProps) {
  return (
    <div className="mb-6">
      <p className="mb-3 text-sm text-slate-500">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition ${
                selected
                  ? "border-blue-500 bg-blue-50/60 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? "border-blue-600" : "border-slate-300"
                }`}
              >
                {selected ? (
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                ) : null}
              </span>
              <span className="text-sm font-medium text-slate-800">
                {option.label}
              </span>
              <span className="ml-auto text-slate-500">
                <Icon icon={option.icon} size={18} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const adminRoleIcon = SchoolIcon;
export const teacherRoleIcon = TeacherIcon;
