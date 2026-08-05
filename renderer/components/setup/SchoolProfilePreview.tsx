import { SchoolIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../ui/Icon";

export interface SchoolProfilePreviewData {
  name: string;
  logoUrl: string | null;
  region: string;
  division: string;
  subdivision: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  schoolType: string;
  schoolCategory: string;
}

interface SchoolProfilePreviewProps {
  data: SchoolProfilePreviewData;
}

/** Live preview card for the school profile setup step. */
export function SchoolProfilePreview({ data }: SchoolProfilePreviewProps) {
  const locationParts = [
    data.address,
    data.subdivision,
    data.division,
    data.region,
  ].filter(Boolean);
  const location = locationParts.join(", ") || "Location not set yet";

  return (
    <aside className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="relative h-28 bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,white,transparent_45%)]" />
      </div>

      <div className="relative px-5 pb-5">
        <div className="-mt-10 mb-4 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-md">
            {data.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.logoUrl}
                alt="School logo"
                className="h-full w-full object-contain"
              />
            ) : (
              <Icon
                icon={SchoolIcon}
                size={32}
                className="text-(--sofia-primary)"
              />
            )}
          </div>
        </div>

        <div className="text-center">
          <h3 className="text-lg font-bold tracking-tight text-slate-900">
            {data.name.trim() || "Your School Name"}
          </h3>
          <p className="mt-1 text-sm italic text-slate-400">
            “Excellence through education”
          </p>
          {(data.schoolType || data.schoolCategory) && (
            <p className="mt-2 text-xs font-medium text-slate-500">
              {[data.schoolType, data.schoolCategory]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>

        <div className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
          <PreviewRow label="Location" value={location} />
          <PreviewRow label="Phone" value={data.phone.trim() || "Not set"} />
          <PreviewRow label="Email" value={data.email.trim() || "Not set"} />
          <PreviewRow
            label="Website"
            value={data.website.trim() || "Not set"}
          />
        </div>
      </div>
    </aside>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 break-words text-slate-700">{value}</p>
    </div>
  );
}
