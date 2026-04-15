"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScanInput } from "./scan-input";
import { LocationSelect } from "./location-select";
import { scanBarcode, getStockForPart, countStock } from "@/lib/api";
import { playSuccess, playError, playScanAck } from "@/lib/sounds";
import type { Part, StockLocation, StockItem, FlashMessage } from "@/lib/types";

interface StocktakeItem {
  id: string;
  part: Part;
  stockItem: StockItem | null;
  systemQty: number;
  countedQty: number;
}

interface ModeStocktakeProps {
  onFlash: (msg: FlashMessage) => void;
}

export function ModeStocktake({ onFlash }: ModeStocktakeProps) {
  const [location, setLocation] = useState<StockLocation | null>(null);
  const [items, setItems] = useState<StocktakeItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleScan(barcode: string) {
    try {
      const result = await scanBarcode(barcode);

      if (result.stocklocation) {
        setLocation(result.stocklocation);
        playScanAck();
        onFlash({ type: "success", text: `盘点库位: ${result.stocklocation.pathstring || result.stocklocation.name}` });
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

      // Check if already in list — increment counted quantity
      const existing = items.find((i) => i.part.pk === part!.pk);
      if (existing) {
        setItems(
          items.map((i) =>
            i.id === existing.id
              ? { ...i, countedQty: i.countedQty + 1 }
              : i
          )
        );
        playScanAck();
        onFlash({ type: "success", text: `${part.name} 计数 +1 (共 ${existing.countedQty + 1})` });
        return;
      }

      // Get system stock for this part at this location
      const stockItems = location
        ? await getStockForPart(part.pk, location.pk)
        : await getStockForPart(part.pk);

      const stockItem = stockItems[0] || null;
      const systemQty = stockItems.reduce((sum, s) => sum + s.quantity, 0);

      setItems([
        {
          id: `${part.pk}-${Date.now()}`,
          part,
          stockItem,
          systemQty,
          countedQty: 1,
        },
        ...items,
      ]);
      playScanAck();
      onFlash({
        type: "success",
        text: `${part.name} 系统库存: ${systemQty}, 开始计数`,
      });
    } catch (err) {
      playError();
      onFlash({
        type: "error",
        text: err instanceof Error ? err.message : "扫码失败",
      });
    }
  }

  async function handleSubmit() {
    if (items.length === 0) {
      playError();
      onFlash({ type: "error", text: "没有盘点数据" });
      return;
    }

    const itemsWithStock = items.filter((i) => i.stockItem);
    if (itemsWithStock.length === 0) {
      playError();
      onFlash({ type: "error", text: "没有可调整的库存记录" });
      return;
    }

    setSubmitting(true);
    try {
      await countStock(
        itemsWithStock.map((i) => ({
          pk: i.stockItem!.pk,
          quantity: i.countedQty,
        }))
      );
      playSuccess();
      onFlash({ type: "success", text: `盘点完成! ${itemsWithStock.length} 种商品已更新` });
      setItems([]);
    } catch (err) {
      playError();
      onFlash({
        type: "error",
        text: err instanceof Error ? err.message : "盘点提交失败",
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
        label="盘点库位 (也可扫库位条码)"
      />
      <ScanInput
        onScan={handleScan}
        placeholder="扫描商品条码计数 (每扫一次 +1)..."
        disabled={submitting}
      />

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base flex justify-between items-center">
            <span>盘点列表 ({items.length} 种)</span>
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
              {items.map((item) => {
                const diff = item.countedQty - item.systemQty;
                return (
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
                    <div className="text-xs text-muted-foreground text-right">
                      <div>系统: {item.systemQty}</div>
                    </div>
                    <div className="flex items-center gap-1" data-no-refocus>
                      <span className="text-xs text-muted-foreground">实盘:</span>
                      <Input
                        type="number"
                        value={item.countedQty}
                        onChange={(e) => {
                          const qty = Math.max(0, Number(e.target.value));
                          setItems(
                            items.map((i) =>
                              i.id === item.id ? { ...i, countedQty: qty } : i
                            )
                          );
                        }}
                        className="h-8 w-16 text-center"
                        min={0}
                      />
                    </div>
                    <Badge
                      variant={
                        diff === 0
                          ? "secondary"
                          : diff > 0
                            ? "default"
                            : "destructive"
                      }
                      className="min-w-[3rem] justify-center"
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive"
                      onClick={() =>
                        setItems(items.filter((i) => i.id !== item.id))
                      }
                    >
                      x
                    </Button>
                  </div>
                );
              })}
            </div>
            <Separator className="my-3" />
            <div className="flex gap-2">
              <div className="flex-1 text-sm text-muted-foreground self-center">
                {items.filter((i) => i.countedQty !== i.systemQty).length} 项有差异
              </div>
              <Button
                className="h-12 text-lg px-8"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "提交中..." : "确认盘点"}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
