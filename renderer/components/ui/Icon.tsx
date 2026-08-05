import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

interface IconProps {
  icon: IconSvgElement;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/** Thin wrapper around Hugeicons for consistent sizing. */
export function Icon({
  icon,
  size = 18,
  strokeWidth = 1.75,
  className,
}: IconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      color="currentColor"
      strokeWidth={strokeWidth}
      className={className}
    />
  );
}
