"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ScanInput } from "./scan-input";
import { ItemInfo } from "./item-info";
import { scanBarcode, getStockForPart } from "@/lib/api";
import { playSuccess, playError } from "@/lib/sounds";
import type { Part, StockItem, FlashMessage } from "@/lib/types";

interface ModeLookupProps {
  onFlash: (msg: FlashMessage) => void;
}

export function ModeLookup({ onFlash }: ModeLookupProps) {
  const [part, setPart] = useState<Part | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleScan(barcode: string) {
    setLoading(true);
    setPart(null);
    setStock([]);

    try {
      const result = await scanBarcode(barcode);

      if (result.part) {
        setPart(result.part);
        const stockItems = await getStockForPart(result.part.pk);
        setStock(stockItems);
        playSuccess();
        onFlash({ type: "success", text: `找到: ${result.part.name}` });
      } else if (result.stockitem) {
        const partData = result.stockitem.part_detail;
        if (partData) {
          setPart(partData);
          const stockItems = await getStockForPart(partData.pk);
          setStock(stockItems);
          playSuccess();
          onFlash({ type: "success", text: `找到: ${partData.name}` });
        }
      } else if (result.stocklocation) {
        playWarningAndFlash();
      } else {
        playError();
        onFlash({ type: "error", text: `未找到条码: ${barcode}` });
      }
    } catch (err) {
      playError();
      onFlash({
        type: "error",
        text: err instanceof Error ? err.message : "查询失败",
      });
    } finally {
      setLoading(false);
    }
  }

  function playWarningAndFlash() {
    playSuccess();
    onFlash({ type: "warning", text: "扫到的是库位条码，非商品" });
  }

  return (
    <div className="space-y-4">
      <ScanInput onScan={handleScan} placeholder="扫描商品条码查询..." disabled={loading} />
      <Card>
        <CardContent className="p-0">
          <ItemInfo part={part} stock={stock} loading={loading} />
        </CardContent>
      </Card>
    </div>
  );
}
