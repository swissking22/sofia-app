import React from "react";
import { ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";

interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  rightLabel?: React.ReactNode;
}

/** Labeled auth input with optional password visibility toggle. */
export function AuthField({
  label,
  rightLabel,
  type = "text",
  className = "",
  ...props
}: AuthFieldProps) {
  const [showPassword, setShowPassword] = React.useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <label className="mb-4 block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-slate-700">
        <span>
          {label}
          {props.required ? (
            <span className="text-red-500" aria-hidden>
              {" "}
              *
            </span>
          ) : null}
        </span>
        {rightLabel}
      </span>
      <span className="relative block">
        <input
          {...props}
          type={inputType}
          className={`w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 ${
            isPassword ? "pr-10" : ""
          } ${className}`}
        />
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 transition hover:text-slate-600"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            <Icon icon={showPassword ? ViewOffIcon : ViewIcon} size={18} />
          </button>
        ) : null}
      </span>
    </label>
  );
}

interface AuthSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: ReadonlyArray<string>;
  placeholder?: string;
}

/** Labeled dropdown for auth forms (e.g. country). */
export function AuthSelect({
  label,
  options,
  placeholder = "Select…",
  className = "",
  ...props
}: AuthSelectProps) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {props.required ? (
          <span className="text-red-500" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </span>
      <select
        {...props}
        className={`w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 ${
          !props.value ? "text-slate-400" : "text-slate-900"
        } ${className}`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
