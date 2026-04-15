"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { scanBarcode, searchParts, getPartByIPN, getStockForPart } from "@/lib/api";
import type { Part, StockItem } from "@/lib/types";

type SearchState = "idle" | "searching" | "found" | "notfound";

export function QuickSearch() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [part, setPart] = useState<Part | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search logic: barcode → IPN → name (in that order)
  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setState("idle");
      setPart(null);
      setStock([]);
      return;
    }

    setState("searching");
    setPart(null);
    setStock([]);

    let found: Part | null = null;

    try {
      // 1. Try as barcode
      try {
        const barcodeResult = await scanBarcode(trimmed);
        if (barcodeResult.part) {
          found = barcodeResult.part;
        }
      } catch {
        // not a barcode, continue
      }

      // 2. Try exact IPN match
      if (!found) {
        found = await getPartByIPN(trimmed);
      }

      // 3. Try name / keyword search
      if (!found) {
        const results = await searchParts(trimmed);
        if (results.length === 1) {
          // Single match — show it directly
          found = results[0];
        } else if (results.length > 1) {
          // Multiple matches — show list
          setState("found");
          setPart(null);
          setStock([]);
          // Store results for rendering the list
          setMultiResults(results);
          return;
        }
      }

      if (found) {
        setPart(found);
        const stockItems = await getStockForPart(found.pk);
        setStock(stockItems);
        setState("found");
        setMultiResults([]);
      } else {
        setState("notfound");
        setMultiResults([]);
      }
    } catch {
      setState("notfound");
    }
  }, []);

  const [multiResults, setMultiResults] = useState<Part[]>([]);

  // Debounced search on input change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setState("idle");
      setPart(null);
      setStock([]);
      setMultiResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(query), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // Stock grouped by location
  const stockByLocation = stock.reduce<Record<string, { name: string; qty: number }>>(
    (acc, s) => {
      const key = s.location?.toString() ?? "unallocated";
      const name =
        s.location_detail?.pathstring || s.location_detail?.name || "未分配";
      if (!acc[key]) acc[key] = { name, qty: 0 };
      acc[key].qty += s.quantity;
      return acc;
    },
    {}
  );

  const totalStock = stock.reduce((s, i) => s + i.quantity, 0);
  const isLow =
    part &&
    part.minimum_stock > 0 &&
    totalStock <= part.minimum_stock;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              setState("idle");
              setPart(null);
              setStock([]);
              setMultiResults([]);
            }
          }}
          placeholder="搜索产品：输入 IPN、UPC 条码或产品名..."
          className="h-11 pr-20 text-sm"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {state === "searching" && (
            <span className="text-xs text-muted-foreground animate-pulse">搜索中...</span>
          )}
          {state === "notfound" && (
            <span className="text-xs text-destructive">未找到</span>
          )}
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setState("idle");
                setPart(null);
                setStock([]);
                setMultiResults([]);
                inputRef.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground text-xs ml-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Single result */}
      {state === "found" && part && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base leading-tight">{part.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{part.IPN}</p>
                {part.description && (
                  <p className="text-xs text-muted-foreground mt-1">{part.description}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge
                  variant={isLow ? "destructive" : "secondary"}
                  className="text-sm px-3 py-1"
                >
                  {totalStock} {part.units}
                </Badge>
                {isLow && (
                  <span className="text-xs text-destructive font-medium">
                    ⚠ 低于安全库存 ({part.minimum_stock})
                  </span>
                )}
              </div>
            </div>

            {/* Stock by location */}
            {Object.values(stockByLocation).length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">库存分布</p>
                <div className="flex flex-wrap gap-1">
                  {Object.values(stockByLocation).map(({ name, qty }) => (
                    <Badge key={name} variant="outline" className="text-xs font-normal">
                      {name.split("/").pop()}: {qty}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">暂无库存记录</p>
            )}

            {/* Meta */}
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {part.category_detail && <span>分类: {part.category_detail.name}</span>}
              {part.minimum_stock > 0 && <span>安全库存: {part.minimum_stock}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Multiple results list */}
      {state === "found" && !part && multiResults.length > 1 && (
        <Card>
          <CardContent className="p-2 space-y-0.5">
            <p className="text-xs text-muted-foreground px-2 py-1">
              找到 {multiResults.length} 个产品，点击查看详情：
            </p>
            {multiResults.map((r) => (
              <button
                key={r.pk}
                className="w-full text-left flex items-center justify-between px-2 py-2 rounded hover:bg-muted transition-colors"
                onClick={async () => {
                  setPart(r);
                  const stockItems = await getStockForPart(r.pk);
                  setStock(stockItems);
                  setMultiResults([]);
                }}
              >
                <div>
                  <span className="text-sm font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground font-mono ml-2">{r.IPN}</span>
                </div>
                <Badge variant="outline" className="text-xs">{r.in_stock ?? "—"}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
