"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScanInput } from "./scan-input";
import { LocationSelect } from "./location-select";
import { scanBarcode, getStockForPart, transferStock, mergeTransferStock, validateStockItem } from "@/lib/api";
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

type DuplicateChoice = "merge" | "separate" | "skip";

interface DuplicateWarning {
  item: TransferItem;
  existingStock: StockItem[];
  existingQty: number;
  resolve: (choice: DuplicateChoice) => void;
}

export function ModeTransfer({ onFlash }: ModeTransferProps) {
  const [fromLocation, setFromLocation] = useState<StockLocation | null>(null);
  const [toLocation, setToLocation] = useState<StockLocation | null>(null);
  const [scanPhase, setScanPhase] = useState<"from" | "item" | "to">("from");
  const [items, setItems] = useState<TransferItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning | null>(null);

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
        onFlash({ type: "error", text: `${part.name} 在 ${fromLocation.name} 无库存` });
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
        setItems(items.map((i) =>
          i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i
        ));
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
      onFlash({ type: "error", text: err instanceof Error ? err.message : "扫码失败" });
    }
  }

  // Show merge dialog and wait for user's 3-way choice
  function askDuplicate(item: TransferItem, existingStock: StockItem[]): Promise<DuplicateChoice> {
    const existingQty = existingStock.reduce((s, si) => s + si.quantity, 0);
    return new Promise((resolve) => {
      setDuplicateWarning({ item, existingStock, existingQty, resolve });
    });
  }

  function handleDuplicateChoice(choice: DuplicateChoice) {
    if (duplicateWarning) {
      duplicateWarning.resolve(choice);
      setDuplicateWarning(null);
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
      // Check each item for duplicates at target location, then act on choice
      const itemsForNormalTransfer: TransferItem[] = [];

      for (const item of items) {
        const destStock = await getStockForPart(item.part.pk, toLocation.pk);
        const destQty = destStock.reduce((s, si) => s + si.quantity, 0);

        if (destQty > 0) {
          const choice = await askDuplicate(item, destStock);

          if (choice === "skip") continue;

          if (choice === "merge") {
            // Validate both stock items still exist before merge
            await validateStockItem(item.stockItem.pk);
            const destItem = destStock[0];
            await validateStockItem(destItem.pk);
            await mergeTransferStock(item.stockItem.pk, destItem.pk, item.quantity);
            continue; // handled, skip normal transfer
          }
          // choice === "separate": fall through to normal transfer
        }

        itemsForNormalTransfer.push(item);
      }

      if (itemsForNormalTransfer.length > 0) {
        await transferStock(
          itemsForNormalTransfer.map((i) => ({ pk: i.stockItem.pk, quantity: i.quantity })),
          toLocation.pk
        );
      }

      playSuccess();
      onFlash({
        type: "success",
        text: `调拨成功! ${items.length} 种商品从 ${fromLocation?.name} 到 ${toLocation.name}`,
      });
      setItems([]);
      setScanPhase("from");
    } catch (err) {
      playError();
      onFlash({ type: "error", text: err instanceof Error ? err.message : "调拨失败" });
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
      {/* Duplicate warning dialog — 3-way choice */}
      <AlertDialog open={!!duplicateWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>目标库位已有相同产品</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateWarning?.item.part.name} 在 {toLocation?.name} 已有{" "}
              {duplicateWarning?.existingQty} 件，本次调拨{" "}
              {duplicateWarning?.item.quantity} 件。请选择处理方式：
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2 space-y-2 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <p>• <span className="font-medium">合并</span>：数量叠加到目标库位已有库存 → 共{" "}
                {(duplicateWarning?.existingQty ?? 0) + (duplicateWarning?.item.quantity ?? 0)} 件，保持 1 条记录</p>
              <p>• <span className="font-medium">独立</span>：在目标库位新建独立条目 → 产生 2 条记录</p>
              <p>• <span className="font-medium">跳过</span>：不调拨此商品</p>
            </div>
          </div>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => handleDuplicateChoice("skip")}>
              跳过
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              onClick={() => handleDuplicateChoice("separate")}
            >
              独立调拨
            </AlertDialogAction>
            <AlertDialogAction onClick={() => handleDuplicateChoice("merge")}>
              合并调拨
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="text-sm text-muted-foreground font-medium">{phaseHint}</div>

      <div className="grid grid-cols-2 gap-3">
        <LocationSelect
          value={fromLocation?.pk}
          onChange={(loc) => { setFromLocation(loc); setScanPhase("item"); }}
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
          <CardTitle className="text-base">待调拨 ({items.length} 种)</CardTitle>
        </CardHeader>
        {items.length > 0 && (
          <CardContent className="px-4 pb-4 pt-0">
            <div className="space-y-1">
              {items.map((item) => (
                <div key={item.id} className="py-3 border-b last:border-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm leading-tight">{item.part.name}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        {item.part.IPN} · 可用: {item.available}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive shrink-0"
                      onClick={() => setItems(items.filter((i) => i.id !== item.id))}>x</Button>
                  </div>
                  <div className="flex items-center gap-1" data-no-refocus>
                    <Button variant="outline" size="sm" className="h-9 w-9 p-0 text-lg"
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
                      className="h-9 w-16 text-center text-base" min={1} max={item.available} />
                    <Button variant="outline" size="sm" className="h-9 w-9 p-0 text-lg"
                      onClick={() => {
                        if (item.quantity < item.available)
                          setItems(items.map((i) => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
                      }}>+</Button>
                  </div>
                </div>
              ))}
            </div>
            <Separator className="my-3" />
            <Button
              className="w-full h-12 text-lg"
              onClick={handleSubmit}
              disabled={submitting || !toLocation}
            >
              {submitting ? "处理中..." : `确认调拨 (${items.reduce((s, i) => s + i.quantity, 0)} 件)`}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
