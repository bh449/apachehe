"use client";

import type { Part, StockItem, StockLocation } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface ItemInfoProps {
  part: Part | null;
  stock?: StockItem[];
  location?: StockLocation | null;
  loading?: boolean;
}

export function ItemInfo({ part, stock, location, loading }: ItemInfoProps) {
  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground animate-pulse">
        查询中...
      </div>
    );
  }

  if (!part) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        扫描条码查看商品信息
      </div>
    );
  }

  const totalStock = stock
    ? stock.reduce((sum, s) => sum + s.quantity, 0)
    : part.in_stock;
  const isLowStock = part.minimum_stock > 0 && totalStock <= part.minimum_stock;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold truncate">{part.name}</h3>
          <p className="text-sm text-muted-foreground font-mono">{part.IPN}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={isLowStock ? "destructive" : "secondary"} className="text-base px-3">
            库存: {totalStock} {part.units}
          </Badge>
          {isLowStock && (
            <span className="text-xs text-destructive">低于安全库存 ({part.minimum_stock})</span>
          )}
        </div>
      </div>

      {part.description && (
        <p className="text-sm text-muted-foreground">{part.description}</p>
      )}

      {part.category_detail && (
        <div className="text-sm">
          <span className="text-muted-foreground">分类: </span>
          {part.category_detail.name}
        </div>
      )}

      {location && (
        <div className="text-sm">
          <span className="text-muted-foreground">当前库位: </span>
          <Badge variant="outline">{location.pathstring || location.name}</Badge>
        </div>
      )}

      {stock && stock.length > 0 && (
        <div className="text-sm space-y-1">
          <span className="text-muted-foreground">库存分布:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.values(
              stock.reduce<Record<string, { name: string; qty: number }>>((acc, s) => {
                const key = s.location?.toString() ?? "unallocated";
                const name = s.location_detail?.pathstring || s.location_detail?.name || "未分配";
                if (!acc[key]) acc[key] = { name, qty: 0 };
                acc[key].qty += s.quantity;
                return acc;
              }, {})
            ).map(({ name, qty }) => (
              <Badge key={name} variant="outline" className="text-xs">
                {name}: {qty}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
