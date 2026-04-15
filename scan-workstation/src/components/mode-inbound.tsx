"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { scanBarcode, createStockItem, getStockForPart, addStock, validateStockItem } from "@/lib/api";
import { playSuccess, playError, playScanAck } from "@/lib/sounds";
import type { Part, StockItem, StockLocation, ScanLineItem, FlashMessage } from "@/lib/types";

interface ModeInboundProps {
  onFlash: (msg: FlashMessage) => void;
}

// Represents a pending inbound item that needs a merge decision
interface MergeCandidate {
  lineItem: ScanLineItem;
  existingStock: StockItem[];
  // resolve() is called when the user makes a choice
  resolve: (shouldMerge: boolean) => void;
}

export function ModeInbound({ onFlash }: ModeInboundProps) {
  const [location, setLocation] = useState<StockLocation | null>(null);
  const [items, setItems] = useState<ScanLineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastPart, setLastPart] = useState<Part | null>(null);

  // Dialog state
  const [mergeCandidate, setMergeCandidate] = useState<MergeCandidate | null>(null);

  async function handleScan(barcode: string) {
    try {
      const result = await scanBarcode(barcode);

      if (result.stocklocation) {
        setLocation(result.stocklocation);
        playScanAck();
        onFlash({ type: "success", text: `库位: ${result.stocklocation.pathstring || result.stocklocation.name}` });
        return;
      }

      let part: Part | null = null;
      if (result.part) part = result.part;
      else if (result.stockitem?.part_detail) part = result.stockitem.part_detail;

      if (!part) {
        playError();
        onFlash({ type: "error", text: `未识别条码: ${barcode}` });
        return;
      }

      setLastPart(part);

      const existing = items.find((i) => i.part.pk === part!.pk);
      if (existing) {
        setItems(items.map((i) =>
          i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i
        ));
        playScanAck();
        onFlash({ type: "success", text: `${part.name} +1 (共 ${existing.quantity + 1})` });
      } else {
        const newItem: ScanLineItem = {
          id: `${part.pk}-${Date.now()}`,
          part,
          quantity: 1,
          location: location || undefined,
        };
        setItems([newItem, ...items]);
        playScanAck();
        onFlash({ type: "success", text: `添加: ${part.name}` });
      }
    } catch (err) {
      playError();
      onFlash({ type: "error", text: err instanceof Error ? err.message : "扫码失败" });
    }
  }

  function updateQuantity(id: string, qty: number) {
    if (qty <= 0) {
      setItems(items.filter((i) => i.id !== id));
    } else {
      setItems(items.map((i) => (i.id === id ? { ...i, quantity: qty } : i)));
    }
  }

  // Show merge dialog and wait for user's decision
  function askMerge(lineItem: ScanLineItem, existingStock: StockItem[]): Promise<boolean> {
    return new Promise((resolve) => {
      setMergeCandidate({ lineItem, existingStock, resolve });
    });
  }

  function handleMergeChoice(shouldMerge: boolean) {
    if (mergeCandidate) {
      mergeCandidate.resolve(shouldMerge);
      setMergeCandidate(null);
    }
  }

  async function handleSubmit() {
    if (!location) {
      playError();
      onFlash({ type: "error", text: "请先选择入库库位" });
      return;
    }
    if (items.length === 0) {
      playError();
      onFlash({ type: "error", text: "没有待入库的商品" });
      return;
    }

    setSubmitting(true);
    try {
      for (const item of items) {
        // Re-fetch to get fresh stock state; avoids stale pk errors
        const existingStock = await getStockForPart(item.part.pk, location.pk);
        const hasExisting = existingStock.length > 0;

        let shouldMerge = false;
        if (hasExisting) {
          // Pause and ask the user
          shouldMerge = await askMerge(item, existingStock);
        }

        if (hasExisting && shouldMerge) {
          // Validate the target stock item still exists before merging
          await validateStockItem(existingStock[0].pk);
          await addStock([{ pk: existingStock[0].pk, quantity: item.quantity }]);
        } else {
          // Create a new stock item (even if one already exists)
          await createStockItem({
            part: item.part.pk,
            location: location.pk,
            quantity: item.quantity,
          });
        }
      }

      playSuccess();
      onFlash({
        type: "success",
        text: `入库成功! ${items.length} 种商品已入库到 ${location.name}`,
      });
      setItems([]);
      setLastPart(null);
    } catch (err) {
      playError();
      onFlash({ type: "error", text: err instanceof Error ? err.message : "入库失败" });
    } finally {
      setSubmitting(false);
    }
  }

  // Compute existing total for the dialog
  const existingTotal = mergeCandidate?.existingStock.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Merge confirmation dialog */}
      <AlertDialog open={!!mergeCandidate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>发现已有库存</AlertDialogTitle>
            <AlertDialogDescription>
              {mergeCandidate?.lineItem.part.name} 在 {location?.name} 已有{" "}
              {existingTotal} 件库存，本次入库 {mergeCandidate?.lineItem.quantity} 件。
              选「合并」将叠加到现有库存（共 {existingTotal + (mergeCandidate?.lineItem.quantity ?? 0)} 件），
              选「新建」将创建独立库存条目。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleMergeChoice(false)}>
              新建独立
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleMergeChoice(true)}>
              合并入库
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LocationSelect
        value={location?.pk}
        onChange={setLocation}
        label="目标库位 (也可扫库位条码)"
      />
      <ScanInput
        onScan={handleScan}
        placeholder="扫描商品条码入库..."
        disabled={submitting}
      />

      {lastPart && (
        <div className="text-sm text-muted-foreground">
          最近扫描: <span className="font-medium text-foreground">{lastPart.name}</span>
          <span className="ml-2 font-mono">{lastPart.IPN}</span>
        </div>
      )}

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base flex justify-between items-center">
            <span>待入库 ({items.length} 种)</span>
            {items.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setItems([])}
                className="text-muted-foreground"
              >
                清空
              </Button>
            )}
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
                    <div className="font-medium text-sm truncate">{item.part.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{item.part.IPN}</div>
                  </div>
                  <div className="flex items-center gap-1" data-no-refocus>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.id, Number(e.target.value))}
                      className="h-8 w-16 text-center"
                      min={1}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </Button>
                  </div>
                  <Badge variant="secondary">{item.part.units}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive"
                    onClick={() => setItems(items.filter((i) => i.id !== item.id))}
                  >
                    x
                  </Button>
                </div>
              ))}
            </div>
            <Separator className="my-3" />
            <Button
              className="w-full h-12 text-lg"
              onClick={handleSubmit}
              disabled={submitting || !location}
            >
              {submitting
                ? "处理中..."
                : `确认入库 (${items.reduce((s, i) => s + i.quantity, 0)} 件)`}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
