"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { decodeFromVideo } from "@/lib/barcode";

interface CameraScannerProps {
  open: boolean;
  onResult: (barcode: string) => void;
  onClose: () => void;
}

/**
 * Full-screen camera overlay for live barcode scanning.
 * Only used in HTTPS (secure context) where getUserMedia is available.
 * Scans each video frame with BarcodeDetector, auto-closes on detection.
 */
export function CameraScanner({ open, onResult, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setStarting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStarting(false);
      scanningRef.current = true;
      scanLoop();
    } catch (err) {
      setStarting(false);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("相机权限被拒绝。请前往系统设置 → Safari/Chrome → 相机，允许访问后重试。");
      } else {
        setError("无法打开相机: " + (err instanceof Error ? err.message : "未知错误"));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scan loop: check each frame for barcodes
  const scanLoop = useCallback(() => {
    if (!scanningRef.current) return;

    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      requestAnimationFrame(scanLoop);
      return;
    }

    decodeFromVideo(video).then((result) => {
      if (result && scanningRef.current) {
        scanningRef.current = false;
        onResult(result);
      } else if (scanningRef.current) {
        // Throttle to ~10fps to reduce CPU usage
        setTimeout(scanLoop, 100);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onResult]);

  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
      {/* Close button */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/20 h-10 w-10 p-0 text-xl"
          onClick={() => {
            stopCamera();
            onClose();
          }}
        >
          x
        </Button>
      </div>

      {/* Title */}
      <div className="absolute top-4 left-4 text-white text-sm font-medium">
        对准条码自动识别
      </div>

      {/* Camera preview */}
      <div className="relative w-full max-w-lg aspect-[4/3] overflow-hidden rounded-lg mx-4">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Scan guide overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Center guide frame */}
          <div className="absolute inset-x-8 inset-y-[25%] border-2 border-white/50 rounded-lg" />
          {/* Corner highlights */}
          <div className="absolute left-8 top-[25%] w-6 h-6 border-t-3 border-l-3 border-white rounded-tl-lg" />
          <div className="absolute right-8 top-[25%] w-6 h-6 border-t-3 border-r-3 border-white rounded-tr-lg" />
          <div className="absolute left-8 bottom-[25%] w-6 h-6 border-b-3 border-l-3 border-white rounded-bl-lg" />
          <div className="absolute right-8 bottom-[25%] w-6 h-6 border-b-3 border-r-3 border-white rounded-br-lg" />
        </div>

        {/* Starting indicator */}
        {starting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="text-white text-sm animate-pulse">正在打开相机...</span>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 mx-4 p-3 bg-destructive/20 border border-destructive/40 rounded-lg text-sm text-white max-w-lg">
          {error}
        </div>
      )}

      {/* Bottom hint */}
      <div className="mt-4 text-white/60 text-xs text-center">
        将条码放入框内 · 自动识别后关闭
      </div>
    </div>
  );
}
