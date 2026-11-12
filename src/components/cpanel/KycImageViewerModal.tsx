import React, { useState } from "react";
import { cn } from "@/lib/utils";

export interface KycDocumentImage {
  title: string;
  url: string;
  type?: string;
  description?: string;
}

interface KycImageViewerModalProps {
  isOpen: boolean;
  images: KycDocumentImage[];
  initialIndex?: number;
  userName?: string;
  userEmail?: string;
  isDark?: boolean;
  onClose: () => void;
}

export const KycImageViewerModal: React.FC<KycImageViewerModalProps> = ({
  isOpen,
  images,
  initialIndex = 0,
  userName,
  userEmail,
  isDark = true,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [hasError, setHasError] = useState<Record<number, boolean>>({});

  if (!isOpen || images.length === 0) return null;

  const currentImg = images[currentIndex] || images[0];

  const handleNext = () => {
    setZoom(1);
    setRotation(0);
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrev = () => {
    setZoom(1);
    setRotation(0);
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.75));
  const handleResetZoom = () => {
    setZoom(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleDownload = () => {
    if (!currentImg.url) return;
    const a = document.createElement("a");
    a.href = currentImg.url;
    a.download = `${userName || "user"}_${currentImg.title.replace(/\s+/g, "_")}.jpg`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-[100002] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div
        className={cn(
          "w-full max-w-4xl h-[90vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden relative font-hanken",
          isDark ? "bg-[#0d1117] border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900"
        )}
      >
        {/* Header Bar */}
        <div
          className={cn(
            "px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0",
            isDark ? "border-gray-800 bg-[#161b22]" : "border-gray-150 bg-gray-50"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#FC7A00]/10 border border-[#FC7A00]/30 flex items-center justify-center text-[#FC7A00] shrink-0">
              <span className="material-symbols-outlined text-[22px]">find_in_page</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base leading-tight truncate uppercase">
                {currentImg.title}
              </h3>
              <p className="text-[11px] text-gray-400 font-medium truncate">
                {userName ? `${userName} (${userEmail || "KYC Applicant"})` : "KYC Document Inspection"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownload}
              title="Download Document"
              className={cn(
                "px-3 py-1.5 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs active:scale-95",
                isDark ? "bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-100"
              )}
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={onClose}
              title="Close Inspection Modal"
              className="w-9 h-9 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Main Image Stage */}
        <div className="flex-1 bg-black/40 relative overflow-hidden flex items-center justify-center p-4 select-none">
          {hasError[currentIndex] ? (
            <div className="text-center space-y-3 p-6 max-w-sm">
              <span className="material-symbols-outlined text-[54px] text-rose-500">broken_image</span>
              <p className="font-extrabold text-xs uppercase tracking-wider text-rose-400">
                Failed to Load High-Resolution Document
              </p>
              <p className="text-[11px] text-gray-400 font-medium">
                The image URL may be expired, private, or temporarily unreachable.
              </p>
              <a
                href={currentImg.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-[#FC7A00] text-white text-xs font-bold uppercase rounded-xl hover:bg-[#e06c00] transition-all"
              >
                Open Direct Image Link
              </a>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center overflow-auto no-scrollbar">
              <img
                src={currentImg.url}
                alt={currentImg.title}
                onError={() => setHasError((prev) => ({ ...prev, [currentIndex]: true }))}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: "transform 0.2s ease-out",
                }}
                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl cursor-grab active:cursor-grabbing"
              />
            </div>
          )}

          {/* Navigation Controls (If Multiple Images) */}
          {images.length > 1 && (
            <>
              <button
                onClick={handlePrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 transition-all cursor-pointer backdrop-blur-md shadow-lg active:scale-95"
                title="Previous Document"
              >
                <span className="material-symbols-outlined text-[24px]">chevron_left</span>
              </button>
              <button
                onClick={handleNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 transition-all cursor-pointer backdrop-blur-md shadow-lg active:scale-95"
                title="Next Document"
              >
                <span className="material-symbols-outlined text-[24px]">chevron_right</span>
              </button>
            </>
          )}

          {/* Floating Zoom Controls Bar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 flex items-center gap-3 text-white text-xs shadow-xl">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 0.75}
              className="hover:text-[#FC7A00] disabled:opacity-30 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <span className="material-symbols-outlined text-[18px]">zoom_out</span>
            </button>
            <span className="font-mono text-[11px] font-bold min-w-[40px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={zoom >= 3}
              className="hover:text-[#FC7A00] disabled:opacity-30 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <span className="material-symbols-outlined text-[18px]">zoom_in</span>
            </button>
            <div className="w-[1px] h-4 bg-white/20" />
            <button
              onClick={handleRotate}
              className="hover:text-[#FC7A00] transition-colors cursor-pointer"
              title="Rotate 90°"
            >
              <span className="material-symbols-outlined text-[18px]">rotate_right</span>
            </button>
            <button
              onClick={handleResetZoom}
              className="hover:text-[#FC7A00] transition-colors cursor-pointer text-[10px] font-extrabold uppercase tracking-wider"
              title="Reset Zoom & Rotation"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Footer Thumbnails & Info Drawer */}
        <div
          className={cn(
            "p-3 border-t flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0",
            isDark ? "border-gray-800 bg-[#161b22]" : "border-gray-150 bg-gray-50"
          )}
        >
          {/* Thumbnails Row */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setZoom(1);
                  setRotation(0);
                  setCurrentIndex(idx);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-xl border text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shrink-0",
                  currentIndex === idx
                    ? "bg-[#FC7A00] text-white border-[#FC7A00] shadow-md"
                    : isDark
                    ? "bg-gray-800/80 border-gray-700 text-gray-400 hover:text-white"
                    : "bg-white border-gray-300 text-gray-600 hover:bg-gray-100"
                )}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {idx === 0 ? "badge" : idx === 1 ? "face" : "description"}
                </span>
                <span>{img.title}</span>
              </button>
            ))}
          </div>

          <p className="text-[10px] text-gray-400 font-mono shrink-0">
            Document {currentIndex + 1} of {images.length}
          </p>
        </div>
      </div>
    </div>
  );
};
