import React from "react";

interface ProfileSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

/** White section card used on the school profile form. */
export function ProfileSection({
  title,
  description,
  children,
}: ProfileSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 border-b border-slate-100 pb-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

interface ProfileFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  fullWidth?: boolean;
}

export function ProfileField({
  label,
  hint,
  fullWidth,
  className = "",
  ...props
}: ProfileFieldProps) {
  return (
    <label className={`mb-4 block ${fullWidth ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {props.required ? (
          <span className="text-red-500" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </span>
      <input
        {...props}
        className={`w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
      />
      {hint ? (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

interface ProfileSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: ReadonlyArray<string>;
  placeholder?: string;
  fullWidth?: boolean;
}

export function ProfileSelect({
  label,
  options,
  placeholder = "Select…",
  fullWidth,
  className = "",
  ...props
}: ProfileSelectProps) {
  return (
    <label className={`mb-4 block ${fullWidth ? "sm:col-span-2" : ""}`}>
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
        className={`w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15 ${
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

interface AssetUploadProps {
  label: string;
  hint?: string;
  previewUrl: string | null;
  onFile: (file: File) => void;
  onClear?: () => void;
  accept?: string;
}

/** Logo / stamp / signature upload tile with live preview. */
export function AssetUpload({
  label,
  hint,
  previewUrl,
  onFile,
  onClear,
  accept = "image/png,image/jpeg,image/webp",
}: AssetUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="mb-4 sm:col-span-1">
      <p className="mb-1.5 text-sm font-medium text-slate-700">{label}</p>
      {hint ? <p className="mb-2 text-xs text-slate-400">{hint}</p> : null}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />

      {previewUrl ? (
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={label}
            className="h-16 w-16 rounded-lg object-contain bg-white ring-1 ring-slate-200"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer text-left text-sm font-medium text-(--sofia-primary) hover:underline"
            >
              Replace image
            </button>
            {onClear ? (
              <button
                type="button"
                onClick={onClear}
                className="cursor-pointer text-left text-sm text-slate-500 hover:text-red-600"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500 transition hover:border-(--sofia-primary) hover:bg-indigo-50/40 hover:text-(--sofia-primary)"
        >
          <span className="font-medium">Upload {label.toLowerCase()}</span>
          <span className="text-xs text-slate-400">PNG, JPG, or WebP</span>
        </button>
      )}
    </div>
  );
}
