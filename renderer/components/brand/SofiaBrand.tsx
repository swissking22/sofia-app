import sofiaIcon from "../../assets/images/sofia-icon.png";
import sofiaLogo from "../../assets/images/sofia-logo.png";

type ImageSrc = string | { src: string };

type SofiaBrandProps = {
  /** Full wordmark logo vs icon-only mark */
  variant?: "logo" | "icon";
  className?: string;
  /** Height in CSS (width auto). Defaults depend on variant. */
  height?: number | string;
  alt?: string;
};

function resolveSrc(asset: ImageSrc): string {
  return typeof asset === "string" ? asset : asset.src;
}

/**
 * Official SOFIA brand mark from `renderer/assets/images`.
 * Use `logo` for headers; `icon` for compact sidebar / favicon-style spots.
 */
export function SofiaBrand({
  variant = "logo",
  className = "",
  height,
  alt = "SOFIA",
}: SofiaBrandProps) {
  const src = resolveSrc(variant === "icon" ? sofiaIcon : sofiaLogo);
  const resolvedHeight = height ?? (variant === "icon" ? 36 : 40);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`shrink-0 w-auto object-contain ${className}`}
      style={{ height: resolvedHeight }}
    />
  );
}

export { sofiaIcon, sofiaLogo };
