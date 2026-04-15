"use client";

import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModeLookup } from "@/components/mode-lookup";
import { ModeInbound } from "@/components/mode-inbound";
import { ModeOutbound } from "@/components/mode-outbound";
import { ModeTransfer } from "@/components/mode-transfer";
import { ModeStocktake } from "@/components/mode-stocktake";
import { toast } from "sonner";
import type { ScanMode, FlashMessage } from "@/lib/types";

const MODE_CONFIG: Record<ScanMode, { label: string; color: string }> = {
  lookup: { label: "查询", color: "bg-blue-500" },
  inbound: { label: "入库", color: "bg-green-500" },
  outbound: { label: "出库", color: "bg-orange-500" },
  transfer: { label: "调拨", color: "bg-purple-500" },
  stocktake: { label: "盘点", color: "bg-cyan-500" },
};

export default function ScanWorkstation() {
  const [mode, setMode] = useState<ScanMode>("lookup");
  const [flashClass, setFlashClass] = useState("");

  const handleFlash = useCallback((msg: FlashMessage) => {
    const colorMap = {
      success: "ring-2 ring-green-500 bg-green-50",
      error: "ring-2 ring-red-500 bg-red-50",
      warning: "ring-2 ring-yellow-500 bg-yellow-50",
    };
    setFlashClass(colorMap[msg.type]);
    setTimeout(() => setFlashClass(""), 500);

    if (msg.type === "success") toast.success(msg.text);
    else if (msg.type === "error") toast.error(msg.text);
    else toast.warning(msg.text);
  }, []);

  return (
    <div className={`min-h-screen transition-all duration-200 ${flashClass}`}>
      <header className="border-b bg-card px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">扫码工作台</h1>
            <p className="text-xs text-muted-foreground">Mini ERP + WMS</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${MODE_CONFIG[mode].color}`} />
            <span className="text-sm font-medium">{MODE_CONFIG[mode].label}模式</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as ScanMode)}
          className="space-y-4"
        >
          <TabsList className="w-full grid grid-cols-5">
            {(Object.entries(MODE_CONFIG) as [ScanMode, typeof MODE_CONFIG.lookup][]).map(
              ([key, cfg]) => (
                <TabsTrigger key={key} value={key} className="text-sm">
                  {cfg.label}
                </TabsTrigger>
              )
            )}
          </TabsList>

          <TabsContent value="lookup" className="mt-4">
            <ModeLookup onFlash={handleFlash} />
          </TabsContent>

          <TabsContent value="inbound" className="mt-4">
            <ModeInbound onFlash={handleFlash} />
          </TabsContent>

          <TabsContent value="outbound" className="mt-4">
            <ModeOutbound onFlash={handleFlash} />
          </TabsContent>

          <TabsContent value="transfer" className="mt-4">
            <ModeTransfer onFlash={handleFlash} />
          </TabsContent>

          <TabsContent value="stocktake" className="mt-4">
            <ModeStocktake onFlash={handleFlash} />
          </TabsContent>
        </Tabs>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          扫码枪扫描即自动识别 | 手动输入条码后按 Enter 确认
        </div>
      </main>
    </div>
  );
}
