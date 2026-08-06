import React from "react";
import Cropper, { type Area } from "react-easy-crop";
import { PrimaryButton, SecondaryButton } from "./ui";

const OUTPUT_SIZE = 800;

async function cropImageToSquare(
  imageSrc: string,
  crop: Area,
): Promise<{ dataUrl: string; mimeType: string }> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () =>
      reject(new Error("Could not load image.")),
    );
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not crop image.");

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  const mimeType = "image/jpeg";
  return {
    dataUrl: canvas.toDataURL(mimeType, 0.92),
    mimeType,
  };
}

export interface SquarePhotoUploadProps {
  preview: string | null;
  onChange: (photo: { dataUrl: string; mimeType: string } | null) => void;
  onError?: (message: string) => void;
}

export function SquarePhotoUpload({
  preview,
  onChange,
  onError,
}: SquarePhotoUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [rawSrc, setRawSrc] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [croppedArea, setCroppedArea] = React.useState<Area | null>(null);
  const [cropping, setCropping] = React.useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  function clearPhoto() {
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onFileSelected(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError?.("Photo must be an image (JPEG or PNG).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onError?.("Photo must be under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRawSrc(String(reader.result || ""));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedArea(null);
    };
    reader.readAsDataURL(file);
  }

  function closeCropper() {
    setRawSrc(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function applyCrop() {
    if (!rawSrc || !croppedArea) return;
    setCropping(true);
    try {
      const result = await cropImageToSquare(rawSrc, croppedArea);
      onChange(result);
      setRawSrc(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      onError?.("Could not crop photo.");
    } finally {
      setCropping(false);
    }
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          Student photo (4×4)
        </span>
        <p className="mb-3 text-xs text-slate-500">
          Square passport photo. Drag to crop after choosing.
        </p>
        <button
          type="button"
          onClick={openPicker}
          className="group relative flex aspect-square w-full min-h-55 max-w-70 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 transition hover:border-(--sofia-primary) hover:bg-slate-100/80"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Student photo preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="px-4 text-center text-sm text-slate-400">
              Click to upload
              <span className="mt-1 block text-xs">4×4 square</span>
            </span>
          )}
          {preview ? (
            <span className="absolute inset-x-0 bottom-0 bg-slate-900/55 py-2 text-center text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
              Change photo
            </span>
          ) : null}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => onFileSelected(e.target.files?.[0])}
        />
        {preview ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={openPicker}
              className="cursor-pointer text-sm font-medium text-(--sofia-primary) hover:underline"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={clearPhoto}
              className="cursor-pointer text-sm font-medium text-red-600 hover:text-red-700"
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>

      {rawSrc ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="dialog"
            aria-modal
            className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                Crop to square (4×4)
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Drag to reposition, use the slider to zoom.
              </p>
            </div>
            <div className="relative h-80 bg-slate-900 sm:h-96">
              <Cropper
                image={rawSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_area, pixels) => setCroppedArea(pixels)}
              />
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block text-sm text-slate-600">
                Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="mt-2 block w-full accent-(--sofia-primary)"
                />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <SecondaryButton onClick={closeCropper}>Cancel</SecondaryButton>
                <PrimaryButton
                  type="button"
                  disabled={cropping || !croppedArea}
                  onClick={() => void applyCrop()}
                >
                  {cropping ? "Cropping…" : "Apply crop"}
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
