"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScanInput } from "./scan-input";
import { LocationSelect } from "./location-select";
import { scanBarcode, createStockItem, getStockForPart, addStock } from "@/lib/api";
import { playSuccess, playError, playScanAck } from "@/lib/sounds";
import type { Part, StockLocation, ScanLineItem, FlashMessage } from "@/lib/types";

interface ModeInboundProps {
  onFlash: (msg: FlashMessage) => void;
}

export function ModeInbound({ onFlash }: ModeInboundProps) {
  const [location, setLocation] = useState<StockLocation | null>(null);
  const [items, setItems] = useState<ScanLineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastPart, setLastPart] = useState<Part | null>(null);

  async function handleScan(barcode: string) {
    try {
      // Check if it's a location barcode
      const result = await scanBarcode(barcode);

      if (result.stocklocation) {
        setLocation(result.stocklocation);
        playScanAck();
        onFlash({ type: "success", text: `库位: ${result.stocklocation.pathstring || result.stocklocation.name}` });
        return;
      }

      let part: Part | null = null;

      if (result.part) {
        part = result.part;
      } else if (result.stockitem?.part_detail) {
        part = result.stockitem.part_detail;
      }

      if (!part) {
        playError();
        onFlash({ type: "error", text: `未识别条码: ${barcode}` });
        return;
      }

      setLastPart(part);

      // Check if already in list, increment quantity
      const existing = items.find((i) => i.part.pk === part!.pk);
      if (existing) {
        setItems(
          items.map((i) =>
            i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i
          )
        );
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
      onFlash({
        type: "error",
        text: err instanceof Error ? err.message : "扫码失败",
      });
    }
  }

  function updateQuantity(id: string, qty: number) {
    if (qty <= 0) {
      setItems(items.filter((i) => i.id !== id));
    } else {
      setItems(items.map((i) => (i.id === id ? { ...i, quantity: qty } : i)));
    }
  }

  function removeItem(id: string) {
    setItems(items.filter((i) => i.id !== id));
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
      // For each item, check if stock exists at location, if so add, else create
      for (const item of items) {
        const existingStock = await getStockForPart(item.part.pk, location.pk);
        if (existingStock.length > 0) {
          await addStock([{ pk: existingStock[0].pk, quantity: item.quantity }]);
        } else {
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
      onFlash({
        type: "error",
        text: err instanceof Error ? err.message : "入库失败",
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
                    <div className="font-medium text-sm truncate">
                      {item.part.name}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {item.part.IPN}
                    </div>
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
                      onChange={(e) =>
                        updateQuantity(item.id, Number(e.target.value))
                      }
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
                    onClick={() => removeItem(item.id)}
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
                ? "提交中..."
                : `确认入库 (${items.reduce((s, i) => s + i.quantity, 0)} 件)`}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
