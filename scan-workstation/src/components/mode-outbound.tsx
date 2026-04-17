"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScanInput } from "./scan-input";
import { LocationSelect } from "./location-select";
import { scanBarcode, getStockForPart, removeStock } from "@/lib/api";
import { playSuccess, playError, playWarning, playScanAck } from "@/lib/sounds";
import type { Part, StockLocation, StockItem, FlashMessage } from "@/lib/types";

interface ScanOutItem {
  id: string;
  part: Part;
  stockItem: StockItem;
  quantity: number;
  available: number;
}

interface ModeOutboundProps {
  onFlash: (msg: FlashMessage) => void;
}

export function ModeOutbound({ onFlash }: ModeOutboundProps) {
  const [location, setLocation] = useState<StockLocation | null>(null);
  const [items, setItems] = useState<ScanOutItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleScan(barcode: string) {
    try {
      const result = await scanBarcode(barcode);

      if (result.stocklocation) {
        setLocation(result.stocklocation);
        playScanAck();
        onFlash({ type: "success", text: `出库库位: ${result.stocklocation.pathstring || result.stocklocation.name}` });
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

      // Find stock at location (or all locations)
      const stockItems = await getStockForPart(part.pk, location?.pk);

      if (stockItems.length === 0 || stockItems.every((s) => s.quantity <= 0)) {
        playError();
        onFlash({
          type: "error",
          text: `${part.name} 在${location ? location.name : "所有库位"}无库存!`,
        });
        return;
      }

      // Use first stock item with quantity > 0
      const stockItem = stockItems.find((s) => s.quantity > 0)!;

      // Check if already in list
      const existing = items.find((i) => i.stockItem.pk === stockItem.pk);
      if (existing) {
        if (existing.quantity + 1 > existing.available) {
          playWarning();
          onFlash({
            type: "warning",
            text: `库存不足! ${part.name} 可用: ${existing.available}`,
          });
          return;
        }
        setItems(
          items.map((i) =>
            i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i
          )
        );
        playScanAck();
        onFlash({ type: "success", text: `${part.name} +1 (共 ${existing.quantity + 1})` });
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
        playScanAck();
        onFlash({ type: "success", text: `添加出库: ${part.name} (可用 ${stockItem.quantity})` });
      }
    } catch (err) {
      playError();
      onFlash({
        type: "error",
        text: err instanceof Error ? err.message : "扫码失败",
      });
    }
  }

  function updateQuantity(id: string, qty: number) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (qty <= 0) {
      setItems(items.filter((i) => i.id !== id));
    } else if (qty > item.available) {
      playWarning();
      onFlash({
        type: "warning",
        text: `库存不足! 最大可出: ${item.available}`,
      });
    } else {
      setItems(items.map((i) => (i.id === id ? { ...i, quantity: qty } : i)));
    }
  }

  async function handleSubmit() {
    if (items.length === 0) {
      playError();
      onFlash({ type: "error", text: "没有待出库的商品" });
      return;
    }

    setSubmitting(true);
    try {
      await removeStock(
        items.map((i) => ({ pk: i.stockItem.pk, quantity: i.quantity }))
      );
      playSuccess();
      onFlash({
        type: "success",
        text: `出库成功! ${items.length} 种商品已出库`,
      });
      setItems([]);
    } catch (err) {
      playError();
      onFlash({
        type: "error",
        text: err instanceof Error ? err.message : "出库失败",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <LocationSelect
        value={location?.pk}
        onChange={setLocation}
        label="来源库位 (可选，也可扫库位条码)"
      />
      <ScanInput
        onScan={handleScan}
        placeholder="扫描商品条码出库..."
        disabled={submitting}
      />

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base flex justify-between items-center">
            <span>待出库 ({items.length} 种)</span>
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
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="py-3 border-b last:border-0 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm leading-tight">
                        {item.part.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-mono">{item.part.IPN}</span>
                        <span className="ml-2">
                          可用: {item.available} {item.part.units}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive shrink-0"
                      onClick={() => setItems(items.filter((i) => i.id !== item.id))}
                    >
                      x
                    </Button>
                  </div>
                  <div className="flex items-center gap-1" data-no-refocus>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 p-0 text-lg"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        updateQuantity(item.id, Number(e.target.value))
                      }
                      className="h-9 w-16 text-center text-base"
                      min={1}
                      max={item.available}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 p-0 text-lg"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Separator className="my-3" />
            <Button
              variant="destructive"
              className="w-full h-12 text-lg"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? "提交中..."
                : `确认出库 (${items.reduce((s, i) => s + i.quantity, 0)} 件)`}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
