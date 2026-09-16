import React from "react";
import { CardSurface, interpolate } from "./CardSurface";
import type {
  CardDesign,
  CardElement,
  VariableDef,
} from "../../lib/student-id-cards";

const PX = 4;

function nid() {
  return crypto.randomUUID();
}

const PALETTE: Array<{
  label: string;
  group: string;
  make: (side: "front" | "back") => CardElement;
}> = [
  {
    label: "Add text",
    group: "Elements",
    make: (side) => ({
      id: nid(),
      type: "text",
      side,
      x: 4,
      y: 4,
      w: 30,
      h: 8,
      z: 10,
      text: "Text",
      fontSize: 8,
      color: "#111827",
    }),
  },
  {
    label: "Add student name",
    group: "Student data",
    make: (side) => ({
      id: nid(),
      type: "text",
      side,
      x: 8,
      y: 20,
      w: 40,
      h: 10,
      z: 10,
      text: "{{student.name}}",
      fontSize: 9,
      fontWeight: 700,
      color: "#111827",
    }),
  },
  {
    label: "Add student ID",
    group: "Student data",
    make: (side) => ({
      id: nid(),
      type: "text",
      side,
      x: 8,
      y: 30,
      w: 40,
      h: 8,
      z: 10,
      text: "{{student.student_id}}",
      fontSize: 7,
      color: "#111827",
    }),
  },
  {
    label: "Add student photo",
    group: "Images",
    make: (side) => ({
      id: nid(),
      type: "image",
      side,
      x: 60,
      y: 8,
      w: 18,
      h: 22,
      z: 10,
      imageBinding: "student.photo",
      objectFit: "cover",
      crop: "square",
    }),
  },
  {
    label: "Add school logo",
    group: "Images",
    make: (side) => ({
      id: nid(),
      type: "image",
      side,
      x: 3,
      y: 3,
      w: 12,
      h: 12,
      z: 10,
      imageBinding: "school.logo",
      objectFit: "contain",
    }),
  },
  {
    label: "Add school name",
    group: "School data",
    make: (side) => ({
      id: nid(),
      type: "text",
      side,
      x: 16,
      y: 4,
      w: 50,
      h: 10,
      z: 10,
      text: "{{school.name}}",
      fontSize: 8,
      fontWeight: 700,
      color: "#ffffff",
    }),
  },
  {
    label: "Add QR code",
    group: "QR/Barcode",
    make: (side) => ({
      id: nid(),
      type: "qr",
      side,
      x: 8,
      y: 20,
      w: 18,
      h: 18,
      z: 10,
      qrBinding: "{{card.verification_code}}",
    }),
  },
  {
    label: "Add barcode",
    group: "QR/Barcode",
    make: (side) => ({
      id: nid(),
      type: "barcode",
      side,
      x: 8,
      y: 40,
      w: 50,
      h: 12,
      z: 10,
      barcodeBinding: "{{student.student_id}}",
    }),
  },
  {
    label: "Add signature",
    group: "Signatures",
    make: (side) => ({
      id: nid(),
      type: "image",
      side,
      x: 20,
      y: 36,
      w: 24,
      h: 10,
      z: 10,
      imageBinding: "school.signature",
      objectFit: "contain",
    }),
  },
  {
    label: "Rectangle",
    group: "Shapes",
    make: (side) => ({
      id: nid(),
      type: "shape",
      side,
      shape: "rect",
      x: 0,
      y: 0,
      w: 40,
      h: 12,
      z: 1,
      fill: "#0B2C5C",
    }),
  },
  {
    label: "Circle",
    group: "Shapes",
    make: (side) => ({
      id: nid(),
      type: "shape",
      side,
      shape: "circle",
      crop: "circle",
      x: 10,
      y: 10,
      w: 12,
      h: 12,
      z: 2,
      fill: "#C9A227",
    }),
  },
  {
    label: "Line",
    group: "Shapes",
    make: (side) => ({
      id: nid(),
      type: "shape",
      side,
      shape: "line",
      x: 4,
      y: 40,
      w: 40,
      h: 0.4,
      z: 5,
      fill: "#111827",
      stroke: "#111827",
    }),
  },
];

export function IdCardDesigner({
  name,
  onName,
  design,
  onChange,
  variables,
  students,
  onPreviewStudent,
  previewBindings,
  onSave,
  onDeleteDraft,
  busy,
}: {
  name: string;
  onName: (v: string) => void;
  design: CardDesign;
  onChange: (d: CardDesign) => void;
  variables: VariableDef[];
  students: Array<{ id: string; name: string }>;
  onPreviewStudent: (id: string | null) => void;
  previewBindings: Record<string, string>;
  onSave: () => void;
  onDeleteDraft?: () => void;
  busy: boolean;
}) {
  const [side, setSide] = React.useState<"front" | "back">("front");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [grid, setGrid] = React.useState(true);
  const [snap, setSnap] = React.useState(true);
  const [zoom, setZoom] = React.useState(1);
  const history = React.useRef<CardDesign[]>([design]);
  const future = React.useRef<CardDesign[]>([]);
  const drag = React.useRef<{
    id: string;
    ox: number;
    oy: number;
    sx: number;
    sy: number;
  } | null>(null);

  const push = (next: CardDesign) => {
    history.current.push(next);
    future.current = [];
    onChange(next);
  };

  const undo = () => {
    if (history.current.length < 2) return;
    const cur = history.current.pop();
    if (cur) future.current.push(cur);
    onChange(history.current[history.current.length - 1]);
  };
  const redo = () => {
    const n = future.current.pop();
    if (!n) return;
    history.current.push(n);
    onChange(n);
  };

  const selectedEl = design.elements.find((e) => e.id === selected[0]);

  const patchEl = (id: string, patch: Partial<CardElement>) => {
    push({
      ...design,
      elements: design.elements.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    });
  };

  const add = (make: (s: "front" | "back") => CardElement) => {
    const el = make(side);
    el.z =
      Math.max(
        0,
        ...design.elements.filter((e) => e.side === side).map((e) => e.z || 0),
      ) + 1;
    push({ ...design, elements: [...design.elements, el] });
    setSelected([el.id]);
  };

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      const d = drag.current;
      let x = (e.clientX - d.sx) / (PX * zoom) + d.ox;
      let y = (e.clientY - d.sy) / (PX * zoom) + d.oy;
      if (snap) {
        x = Math.round(x);
        y = Math.round(y);
      }
      onChange({
        ...design,
        elements: design.elements.map((el) =>
          el.id === d.id && !el.locked ? { ...el, x, y } : el,
        ),
      });
    };
    const onUp = () => {
      if (drag.current) {
        history.current.push(design);
        drag.current = null;
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [design, onChange, snap, zoom]);

  const layers = design.elements
    .filter((e) => e.side === side)
    .slice()
    .sort((a, b) => (b.z || 0) - (a.z || 0));

  const groups = Array.from(new Set(PALETTE.map((p) => p.group)));
  const varGroups = Array.from(new Set(variables.map((v) => v.category)));

  return (
    <div className="flex min-h-[70vh] gap-3">
      <aside className="w-56 shrink-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3">
        {groups.map((g) => (
          <div key={g} className="mb-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {g}
            </p>
            <div className="flex flex-col gap-1">
              {PALETTE.filter((p) => p.group === g).map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => add(p.make)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Insert field
        </p>
        {varGroups.map((g) => (
          <details key={g} className="mb-1">
            <summary className="cursor-pointer text-sm capitalize text-slate-600">
              {g}
            </summary>
            <div className="mt-1 flex flex-col">
              {variables
                .filter((v) => v.category === g)
                .map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className="rounded px-2 py-1 text-left text-xs text-slate-600 hover:bg-slate-50"
                    onClick={() => {
                      if (selectedEl?.type === "text") {
                        patchEl(selectedEl.id, {
                          text: `${selectedEl.text || ""}{{${v.key}}}`,
                        });
                      } else {
                        add(() => ({
                          id: nid(),
                          type: "text",
                          side,
                          x: 8,
                          y: 16,
                          w: 36,
                          h: 8,
                          z: 12,
                          text: `{{${v.key}}}`,
                          fontSize: 7,
                          color: "#111827",
                        }));
                      }
                    }}
                  >
                    {v.label}
                  </button>
                ))}
            </div>
          </details>
        ))}
      </aside>

      <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-100 p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => onName(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200"
            onClick={undo}
          >
            Undo
          </button>
          <button
            type="button"
            className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200"
            onClick={redo}
          >
            Redo
          </button>
          <button
            type="button"
            className="rounded-lg bg-(--sofia-primary) px-3 py-1.5 text-sm text-white disabled:opacity-60"
            onClick={onSave}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {onDeleteDraft ? (
            <button
              type="button"
              className="rounded-lg bg-white px-3 py-1.5 text-sm text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
              onClick={onDeleteDraft}
              disabled={busy}
            >
              Delete draft
            </button>
          ) : null}
          <span className="mx-1 h-4 w-px bg-slate-300" />
          {(["front", "back"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm ${side === s ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200"}`}
              onClick={() => setSide(s)}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200"
            onClick={() => setGrid((v) => !v)}
          >
            Grid {grid ? "on" : "off"}
          </button>
          <button
            type="button"
            className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200"
            onClick={() => setSnap((v) => !v)}
          >
            Snap {snap ? "on" : "off"}
          </button>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            Zoom
            <input
              type="range"
              min={0.6}
              max={2}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            onChange={(e) => onPreviewStudent(e.target.value || null)}
            defaultValue=""
          >
            <option value="">Preview with sample data</option>
            {students.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-h-105 items-center justify-center overflow-auto p-6">
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
          >
            <CardSurface
              design={design}
              side={side}
              unit="px"
              showGrid={grid}
              selectedIds={selected}
              bindings={previewBindings}
              onPointerDown={(id, e) => {
                e.stopPropagation();
                setSelected(
                  e.shiftKey ? Array.from(new Set([...selected, id])) : [id],
                );
                const el = design.elements.find((x) => x.id === id);
                if (!el || el.locked) return;
                drag.current = {
                  id,
                  ox: el.x,
                  oy: el.y,
                  sx: e.clientX,
                  sy: e.clientY,
                };
              }}
            />
          </div>
        </div>
      </div>

      <aside className="w-64 shrink-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Card
        </p>
        <label className="mt-2 block text-xs text-slate-500">
          Width (mm)
          <input
            type="number"
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={design.widthMm}
            onChange={(e) =>
              push({ ...design, widthMm: Number(e.target.value) })
            }
          />
        </label>
        <label className="mt-2 block text-xs text-slate-500">
          Height (mm)
          <input
            type="number"
            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={design.heightMm}
            onChange={(e) =>
              push({ ...design, heightMm: Number(e.target.value) })
            }
          />
        </label>
        <label className="mt-2 block text-xs text-slate-500">
          Background
          <input
            type="color"
            className="mt-1 h-8 w-full"
            value={
              (side === "front" ? design.front : design.back).background
                .value || "#ffffff"
            }
            onChange={(e) => {
              const bg = { type: "solid", value: e.target.value };
              push(
                side === "front"
                  ? { ...design, front: { background: bg } }
                  : { ...design, back: { background: bg } },
              );
            }}
          />
        </label>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Layers
        </p>
        <ul className="mt-1 space-y-1">
          {layers.map((el) => (
            <li key={el.id} className="flex items-center gap-1 text-xs">
              <button
                type="button"
                className={`flex-1 truncate rounded px-2 py-1 text-left ${selected.includes(el.id) ? "bg-sky-50 text-sky-800" : "hover:bg-slate-50"}`}
                onClick={() => setSelected([el.id])}
              >
                {el.type === "text"
                  ? interpolate(el.text || "Text", previewBindings) || "Text"
                  : el.type}
              </button>
              <button
                type="button"
                onClick={() => patchEl(el.id, { hidden: !el.hidden })}
              >
                {el.hidden ? "Show" : "Hide"}
              </button>
              <button
                type="button"
                onClick={() => patchEl(el.id, { locked: !el.locked })}
              >
                {el.locked ? "Unlock" : "Lock"}
              </button>
            </li>
          ))}
        </ul>
        {selectedEl ? (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Selected
            </p>
            {selectedEl.type === "text" ? (
              <textarea
                className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                rows={3}
                value={selectedEl.text}
                onChange={(e) =>
                  patchEl(selectedEl.id, { text: e.target.value })
                }
              />
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {(["x", "y", "w", "h"] as const).map((k) => (
                <label key={k} className="text-xs text-slate-500">
                  {k.toUpperCase()}
                  <input
                    type="number"
                    className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1"
                    value={selectedEl[k]}
                    onChange={(e) =>
                      patchEl(selectedEl.id, { [k]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            {selectedEl.type === "text" ? (
              <>
                <label className="text-xs text-slate-500">
                  Size
                  <input
                    type="number"
                    className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1"
                    value={selectedEl.fontSize || 8}
                    onChange={(e) =>
                      patchEl(selectedEl.id, {
                        fontSize: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Color
                  <input
                    type="color"
                    className="mt-0.5 h-8 w-full"
                    value={selectedEl.color || "#111111"}
                    onChange={(e) =>
                      patchEl(selectedEl.id, { color: e.target.value })
                    }
                  />
                </label>
              </>
            ) : null}
            {selectedEl.type === "shape" ? (
              <label className="text-xs text-slate-500">
                Fill
                <input
                  type="color"
                  className="mt-0.5 h-8 w-full"
                  value={
                    selectedEl.fill && selectedEl.fill !== "transparent"
                      ? selectedEl.fill
                      : "#0B2C5C"
                  }
                  onChange={(e) =>
                    patchEl(selectedEl.id, { fill: e.target.value })
                  }
                />
              </label>
            ) : null}
            <div className="flex flex-wrap gap-1">
              {["left", "center", "right"].map((a) => (
                <button
                  key={a}
                  type="button"
                  className="rounded bg-slate-50 px-2 py-1 text-xs"
                  onClick={() => patchEl(selectedEl.id, { align: a })}
                >
                  {a}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="rounded bg-slate-50 px-2 py-1 text-xs"
                onClick={() =>
                  push({
                    ...design,
                    elements: design.elements.map((e) =>
                      e.id === selectedEl.id ? { ...e, z: (e.z || 1) + 1 } : e,
                    ),
                  })
                }
              >
                Bring forward
              </button>
              <button
                type="button"
                className="rounded bg-slate-50 px-2 py-1 text-xs"
                onClick={() =>
                  push({
                    ...design,
                    elements: design.elements.map((e) =>
                      e.id === selectedEl.id ? { ...e, z: (e.z || 1) - 1 } : e,
                    ),
                  })
                }
              >
                Send backward
              </button>
              <button
                type="button"
                className="rounded bg-slate-50 px-2 py-1 text-xs"
                onClick={() => {
                  const copy = {
                    ...selectedEl,
                    id: nid(),
                    x: selectedEl.x + 2,
                    y: selectedEl.y + 2,
                  };
                  push({ ...design, elements: [...design.elements, copy] });
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="rounded bg-red-50 px-2 py-1 text-xs text-red-700"
                onClick={() =>
                  push({
                    ...design,
                    elements: design.elements.filter(
                      (e) => e.id !== selectedEl.id,
                    ),
                  })
                }
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-slate-500">
            Select an element to edit its position, type, and colours.
          </p>
        )}
      </aside>
    </div>
  );
}
