"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScanInput } from "./scan-input";
import { LocationSelect } from "./location-select";
import { scanBarcode, getStockForPart, transferStock } from "@/lib/api";
import { playSuccess, playError, playWarning, playScanAck } from "@/lib/sounds";
import type { Part, StockLocation, StockItem, FlashMessage } from "@/lib/types";

interface TransferItem {
  id: string;
  part: Part;
  stockItem: StockItem;
  quantity: number;
  available: number;
}

interface ModeTransferProps {
  onFlash: (msg: FlashMessage) => void;
}

export function ModeTransfer({ onFlash }: ModeTransferProps) {
  const [fromLocation, setFromLocation] = useState<StockLocation | null>(null);
  const [toLocation, setToLocation] = useState<StockLocation | null>(null);
  const [scanPhase, setScanPhase] = useState<"from" | "item" | "to">("from");
  const [items, setItems] = useState<TransferItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleScan(barcode: string) {
    try {
      const result = await scanBarcode(barcode);

      // Location barcode
      if (result.stocklocation) {
        if (scanPhase === "from" || (!fromLocation && !toLocation)) {
          setFromLocation(result.stocklocation);
          setScanPhase("item");
          playScanAck();
          onFlash({ type: "success", text: `来源库位: ${result.stocklocation.pathstring || result.stocklocation.name}` });
        } else if (scanPhase === "to" || (fromLocation && !toLocation && items.length > 0)) {
          setToLocation(result.stocklocation);
          playScanAck();
          onFlash({ type: "success", text: `目标库位: ${result.stocklocation.pathstring || result.stocklocation.name}` });
        }
        return;
      }

      // Item barcode
      let part: Part | null = null;
      if (result.part) part = result.part;
      else if (result.stockitem?.part_detail) part = result.stockitem.part_detail;

      if (!part) {
        playError();
        onFlash({ type: "error", text: `未识别条码: ${barcode}` });
        return;
      }

      if (!fromLocation) {
        playWarning();
        onFlash({ type: "warning", text: "请先扫描或选择来源库位" });
        return;
      }

      const stockItems = await getStockForPart(part.pk, fromLocation.pk);
      if (stockItems.length === 0 || stockItems.every((s) => s.quantity <= 0)) {
        playError();
        onFlash({
          type: "error",
          text: `${part.name} 在 ${fromLocation.name} 无库存`,
        });
        return;
      }

      const stockItem = stockItems.find((s) => s.quantity > 0)!;
      const existing = items.find((i) => i.stockItem.pk === stockItem.pk);

      if (existing) {
        if (existing.quantity + 1 > existing.available) {
          playWarning();
          onFlash({ type: "warning", text: `库存不足! 可调拨: ${existing.available}` });
          return;
        }
        setItems(
          items.map((i) =>
            i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i
          )
        );
      } else {
        setItems([
          {
            id: `${stockItem.pk}-${Date.now()}`,
            part,
            stockItem,
            quantity: 1,
            available: stockItem.quantity,
          },
          ...items,
        ]);
      }

      setScanPhase("to");
      playScanAck();
      onFlash({ type: "success", text: `调拨: ${part.name}` });
    } catch (err) {
      playError();
      onFlash({
        type: "error",
        text: err instanceof Error ? err.message : "扫码失败",
      });
    }
  }

  async function handleSubmit() {
    if (!toLocation) {
      playError();
      onFlash({ type: "error", text: "请选择目标库位" });
      return;
    }
    if (items.length === 0) {
      playError();
      onFlash({ type: "error", text: "没有待调拨商品" });
      return;
    }
    if (fromLocation?.pk === toLocation.pk) {
      playError();
      onFlash({ type: "error", text: "来源和目标库位不能相同" });
      return;
    }

    setSubmitting(true);
    try {
      await transferStock(
        items.map((i) => ({ pk: i.stockItem.pk, quantity: i.quantity })),
        toLocation.pk
      );
      playSuccess();
      onFlash({
        type: "success",
        text: `调拨成功! ${items.length} 种商品从 ${fromLocation?.name} 到 ${toLocation.name}`,
      });
      setItems([]);
      setScanPhase("from");
    } catch (err) {
      playError();
      onFlash({
        type: "error",
        text: err instanceof Error ? err.message : "调拨失败",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const phaseHint =
    scanPhase === "from"
      ? "步骤 1/3: 扫描来源库位"
      : scanPhase === "item"
        ? "步骤 2/3: 扫描商品条码"
        : "步骤 3/3: 扫描目标库位 (或直接提交)";

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground font-medium">{phaseHint}</div>

      <div className="grid grid-cols-2 gap-3">
        <LocationSelect
          value={fromLocation?.pk}
          onChange={(loc) => {
            setFromLocation(loc);
            setScanPhase("item");
          }}
          label="来源库位"
        />
        <LocationSelect
          value={toLocation?.pk}
          onChange={setToLocation}
          label="目标库位"
        />
      </div>

      <ScanInput
        onScan={handleScan}
        placeholder="扫描库位或商品条码..."
        disabled={submitting}
      />

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">
            待调拨 ({items.length} 种)
          </CardTitle>
        </CardHeader>
        {items.length > 0 && (
          <CardContent className="px-4 pb-4 pt-0">
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 py-2 border-b last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {item.part.name}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {item.part.IPN} (可用: {item.available})
                    </div>
                  </div>
                  <div className="flex items-center gap-1" data-no-refocus>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                      onClick={() => {
                        const qty = item.quantity - 1;
                        if (qty <= 0) setItems(items.filter((i) => i.id !== item.id));
                        else setItems(items.map((i) => i.id === item.id ? { ...i, quantity: qty } : i));
                      }}>-</Button>
                    <Input type="number" value={item.quantity}
                      onChange={(e) => {
                        const qty = Math.min(Number(e.target.value), item.available);
                        if (qty > 0) setItems(items.map((i) => i.id === item.id ? { ...i, quantity: qty } : i));
                      }}
                      className="h-8 w-16 text-center" min={1} max={item.available} />
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                      onClick={() => {
                        if (item.quantity < item.available)
                          setItems(items.map((i) => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
                      }}>+</Button>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive"
                    onClick={() => setItems(items.filter((i) => i.id !== item.id))}>x</Button>
                </div>
              ))}
            </div>
            <Separator className="my-3" />
            <Button
              className="w-full h-12 text-lg"
              onClick={handleSubmit}
              disabled={submitting || !toLocation}
            >
              {submitting ? "提交中..." : `确认调拨 (${items.reduce((s, i) => s + i.quantity, 0)} 件)`}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
