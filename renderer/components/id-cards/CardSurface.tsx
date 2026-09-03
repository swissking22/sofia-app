import React from "react";
import type { CardDesign, CardElement } from "../../lib/student-id-cards";

export function interpolate(template: string, bindings: Record<string, string>): string {
  return String(template ?? "").replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, raw: string) => {
    const value = bindings[raw.trim()];
    return value == null ? "" : String(value);
  });
}

function bgStyle(side: CardDesign["front"]) {
  const b = side.background;
  if (b.type === "gradient") {
    return {
      background: `linear-gradient(180deg, ${b.value}, ${b.value2 || b.value})`,
    };
  }
  if (b.type === "image" && b.imageSrc) {
    return {
      backgroundImage: `url(${b.imageSrc})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { background: b.value || "#fff" };
}

function IconGlyph({ name }: { name?: string }) {
  const d =
    name === "email"
      ? "M4 6h16v12H4z"
      : name === "location"
        ? "M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7z"
        : name === "website"
          ? "M12 2a10 10 0 100 20 10 10 0 000-20z"
          : "M4 6a8 8 0 0116 4c0 6-8 12-8 12S4 16 4 10a8 8 0 010-4z";
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d={d} />
    </svg>
  );
}

export function CardSurface({
  design,
  side,
  unit = "mm",
  selectedIds = [],
  onPointerDown,
  showGrid = false,
  bindings = {},
}: {
  design: CardDesign;
  side: "front" | "back";
  unit?: "mm" | "px";
  selectedIds?: string[];
  onPointerDown?: (id: string, e: React.PointerEvent) => void;
  showGrid?: boolean;
  bindings?: Record<string, string>;
}) {
  const w = design.widthMm;
  const h = design.heightMm;
  const bg = side === "front" ? design.front : design.back;
  const elements = [...design.elements]
    .filter((el) => el.side === side && !el.hidden)
    .sort((a, b) => (a.z || 0) - (b.z || 0));

  return (
    <div
      className="relative overflow-hidden shadow-md"
      style={{
        width: unit === "mm" ? `${w}mm` : `${w * 4}px`,
        height: unit === "mm" ? `${h}mm` : `${h * 4}px`,
        ...bgStyle(bg),
        backgroundImage: showGrid
          ? `linear-gradient(to right, rgba(15,23,42,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,.08) 1px, transparent 1px), ${
              bgStyle(bg).backgroundImage || "none"
            }`
          : bgStyle(bg).backgroundImage,
        backgroundSize: showGrid ? "4px 4px, 4px 4px, cover" : undefined,
      }}
    >
      {elements.map((el) => (
        <ElementView
          key={el.id}
          el={el}
          unit={unit}
          selected={selectedIds.includes(el.id)}
          onPointerDown={onPointerDown}
          bindings={bindings}
        />
      ))}
    </div>
  );
}

function ElementView({
  el,
  unit,
  selected,
  onPointerDown,
  bindings,
}: {
  el: CardElement;
  unit: "mm" | "px";
  selected: boolean;
  onPointerDown?: (id: string, e: React.PointerEvent) => void;
  bindings: Record<string, string>;
}) {
  const dim = (n: number) => (unit === "mm" ? `${n}mm` : `${n * 4}px`);
  const text = el.resolvedText ?? interpolate(el.text || "", bindings);
  const image =
    el.resolvedImage ||
    (el.imageBinding === "student.photo"
      ? bindings["student.photo"]
      : el.imageBinding === "school.logo"
        ? bindings["school.logo"]
        : el.imageSrc);
  const radius =
    el.crop === "circle"
      ? "50%"
      : el.crop === "rounded" || el.shape === "roundRect"
        ? `${el.borderRadius || 2}${unit === "mm" ? "mm" : "px"}`
        : el.borderRadius
          ? `${el.borderRadius}${unit === "mm" ? "mm" : "px"}`
          : undefined;

  return (
    <div
      data-el={el.id}
      onPointerDown={(e) => onPointerDown?.(el.id, e)}
      className={`absolute ${selected ? "ring-2 ring-sky-500" : ""} ${el.locked ? "cursor-default" : "cursor-move"}`}
      style={{
        left: dim(el.x),
        top: dim(el.y),
        width: dim(el.w),
        height: dim(el.h),
        opacity: el.opacity ?? 1,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: "center",
        zIndex: el.z || 1,
        color: el.color,
        fontFamily: el.fontFamily || "Georgia, serif",
        fontSize: el.fontSize ? `${el.fontSize}pt` : undefined,
        fontWeight: el.fontWeight,
        fontStyle: el.fontStyle,
        textAlign: (el.align as React.CSSProperties["textAlign"]) || "left",
        letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
        lineHeight: el.lineHeight,
        textTransform: (el.textTransform as React.CSSProperties["textTransform"]) || undefined,
        writingMode: el.writingMode === "vertical" ? "vertical-rl" : undefined,
        overflow: "hidden",
        border: el.borderWidth
          ? `${el.borderWidth}mm solid ${el.borderColor || "#111"}`
          : undefined,
        borderRadius: radius,
        background:
          el.type === "shape"
            ? el.fill === "transparent"
              ? "transparent"
              : el.fill
            : undefined,
        outline: el.type === "shape" && el.stroke ? `${el.strokeWidth || 0.3}mm solid ${el.stroke}` : undefined,
      }}
    >
      {el.type === "text" ? (
        <div className="h-full w-full whitespace-pre-wrap leading-tight">{text}</div>
      ) : null}
      {el.type === "image" && image ? (
        <img
          src={image}
          alt=""
          className="h-full w-full"
          style={{ objectFit: (el.objectFit as React.CSSProperties["objectFit"]) || "cover" }}
        />
      ) : null}
      {el.type === "image" && !image ? (
        <div className="flex h-full w-full items-center justify-center bg-slate-200 text-[8px] text-slate-500">
          Photo
        </div>
      ) : null}
      {el.type === "qr" ? (
        el.qrSvg ? (
          <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: el.qrSvg }} />
        ) : (
          <div className="grid h-full w-full place-items-center bg-white text-[7px]">QR</div>
        )
      ) : null}
      {el.type === "barcode" ? (
        el.barcodeSvg ? (
          <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: el.barcodeSvg }} />
        ) : (
          <div className="flex h-full items-end justify-center bg-white text-[7px]">|||| {text || "ID"}</div>
        )
      ) : null}
      {el.type === "icon" ? <IconGlyph name={el.icon} /> : null}
      {el.type === "shape" && el.shape === "line" ? (
        <div className="h-full w-full" style={{ background: el.stroke || el.fill || "#111" }} />
      ) : null}
    </div>
  );
}
