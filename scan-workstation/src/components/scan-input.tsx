"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CameraScanner } from "./camera-scanner";
import { canUseLiveCamera, decodeFromImage } from "@/lib/barcode";
import { playScanAck, playError } from "@/lib/sounds";
import { toast } from "sonner";

interface ScanInputProps {
  onScan: (barcode: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

// Deduplicate: ignore same barcode within this window (ms)
const DEDUP_WINDOW_MS = 1500;

export function ScanInput({ onScan, placeholder, disabled }: ScanInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<{ value: string; time: number } | null>(null);

  const [liveMode, setLiveMode] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [decoding, setDecoding] = useState(false);

  // Detect whether live camera is available (HTTPS)
  useEffect(() => {
    setLiveMode(canUseLiveCamera());
  }, []);

  // Deduplicated scan handler
  const handleBarcodeScan = useCallback(
    (barcode: string) => {
      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.value === barcode && now - last.time < DEDUP_WINDOW_MS) {
        return; // Duplicate within window, ignore
      }
      lastScanRef.current = { value: barcode, time: now };
      playScanAck();
      onScan(barcode);
    },
    [onScan]
  );

  // Auto-focus on mount and re-focus when clicking empty areas
  useEffect(() => {
    const el = inputRef.current;
    if (el && !disabled) el.focus();

    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Don't steal focus from other inputs/buttons/selects
      // Base UI Select uses portals (rendered outside data-no-refocus),
      // so also check data-slot and ARIA roles to avoid closing dropdowns
      if (
        target.tagName === "INPUT" ||
        target.tagName === "BUTTON" ||
        target.tagName === "SELECT" ||
        target.tagName === "LABEL" ||
        target.closest("[data-no-refocus]") ||
        target.closest("[data-slot]") ||
        target.closest("[role='listbox']") ||
        target.closest("[role='option']") ||
        target.closest("[data-camera-trigger]")
      ) {
        return;
      }
      inputRef.current?.focus();
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [disabled]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const value = inputRef.current?.value?.trim();
      if (value) {
        handleBarcodeScan(value);
        if (inputRef.current) inputRef.current.value = "";
      }
    }
  }

  // --- Photo mode: handle file input change ---
  async function handleFileCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setDecoding(true);
    try {
      const { barcode } = await decodeFromImage(file);
      if (barcode) {
        handleBarcodeScan(barcode);
      } else {
        playError();
        toast.error("未识别到条码，请确保条码清晰完整后重试");
      }
    } catch {
      playError();
      toast.error("图片解码失败，请重试");
    } finally {
      setDecoding(false);
      // Reset file input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // --- Live mode: handle camera result ---
  function handleLiveResult(barcode: string) {
    setCameraOpen(false);
    handleBarcodeScan(barcode);
  }

  // --- Camera button click ---
  function handleCameraClick() {
    if (disabled || decoding) return;

    if (liveMode) {
      setCameraOpen(true);
    } else {
      // Trigger hidden file input for photo capture
      fileInputRef.current?.click();
    }
  }

  return (
    <>
      <div className="relative" data-camera-trigger>
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder || "扫描条码 / 输入条码后按回车..."}
          onKeyDown={handleKeyDown}
          disabled={disabled || decoding}
          autoComplete="off"
          autoFocus
          className="h-14 text-lg pl-4 pr-24 font-mono tracking-wider border-2 border-primary/30 focus:border-primary transition-colors"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {decoding && (
            <span className="text-xs text-muted-foreground animate-pulse mr-1">
              识别中...
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleCameraClick}
            disabled={disabled || decoding}
            title={liveMode ? "相机扫码" : "拍照识别条码"}
          >
            <CameraIcon />
          </Button>
          <span className="text-muted-foreground text-xs hidden sm:inline">
            ⏎
          </span>
        </div>

        {/* Hidden file input for photo capture mode */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileCapture}
        />
      </div>

      {/* Live camera overlay (HTTPS only) */}
      {liveMode && (
        <CameraScanner
          open={cameraOpen}
          onResult={handleLiveResult}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );
}

/** Camera SVG icon - simple and clean */
function CameraIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
