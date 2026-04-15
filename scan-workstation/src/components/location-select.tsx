"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLocations } from "@/lib/api";
import type { StockLocation } from "@/lib/types";

interface LocationSelectProps {
  value?: number;
  onChange: (location: StockLocation) => void;
  label?: string;
}

export function LocationSelect({ value, onChange, label }: LocationSelectProps) {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLocations()
      .then(setLocations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div data-no-refocus>
      {label && <label className="text-sm text-muted-foreground mb-1 block">{label}</label>}
      <Select
        value={value?.toString()}
        onValueChange={(val) => {
          const loc = locations.find((l) => l.pk === Number(val));
          if (loc) onChange(loc);
        }}
        disabled={loading}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={loading ? "加载库位..." : "选择库位"} />
        </SelectTrigger>
        <SelectContent>
          {locations.map((loc) => (
            <SelectItem key={loc.pk} value={loc.pk.toString()}>
              {loc.pathstring || loc.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
