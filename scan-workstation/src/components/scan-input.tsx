"use client";

import { useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";

interface ScanInputProps {
  onScan: (barcode: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ScanInput({ onScan, placeholder, disabled }: ScanInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount and re-focus when clicking anywhere
  useEffect(() => {
    const el = inputRef.current;
    if (el && !disabled) el.focus();

    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Don't steal focus from other inputs/buttons
      if (
        target.tagName === "INPUT" ||
        target.tagName === "BUTTON" ||
        target.tagName === "SELECT" ||
        target.closest("[data-no-refocus]")
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
        onScan(value);
        if (inputRef.current) inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="text"
        placeholder={placeholder || "扫描条码 / 输入条码后按回车..."}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoComplete="off"
        autoFocus
        className="h-14 text-lg px-4 font-mono tracking-wider border-2 border-primary/30 focus:border-primary transition-colors"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
        ⏎ Enter
      </div>
    </div>
  );
}
