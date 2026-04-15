// InvenTree API client for the scan workstation

import type {
  Part,
  StockLocation,
  StockItem,
  BarcodeScanResult,
  RawBarcodeScanResult,
} from "./types";

const API_BASE = "/api/inventree";

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    let message = `API Error ${res.status}`;
    try {
      const json = JSON.parse(text);
      message = json.detail || json.error || JSON.stringify(json);
    } catch {
      message = text || message;
    }
    throw new Error(message);
  }

  return res.json();
}

// --- Barcode ---

export async function scanBarcode(barcode: string): Promise<BarcodeScanResult> {
  // InvenTree barcode API returns nested refs: { part: { pk, instance: Part } }
  // We normalize to flat structure so components can use result.part.name directly
  const raw = await request<RawBarcodeScanResult>("/barcode/", {
    method: "POST",
    body: JSON.stringify({ barcode }),
  });

  const normalized: BarcodeScanResult = {
    barcode_data: raw.barcode_data,
    barcode_hash: raw.barcode_hash,
    plugin: raw.plugin,
    success: !!raw.success,
    error: raw.error,
  };

  if (raw.part?.instance) {
    // instance already contains pk; spread first, then override to ensure outer pk wins
    normalized.part = { ...raw.part.instance, pk: raw.part.pk };
  }

  if (raw.stockitem?.instance) {
    normalized.stockitem = { ...raw.stockitem.instance, pk: raw.stockitem.pk };
  }

  if (raw.stocklocation?.instance) {
    normalized.stocklocation = { ...raw.stocklocation.instance, pk: raw.stocklocation.pk };
  }

  return normalized;
}

// --- Parts ---

export async function getPart(pk: number): Promise<Part> {
  return request<Part>(`/part/${pk}/`);
}

export async function searchParts(search: string): Promise<Part[]> {
  const data = await request<Part[] | { results: Part[] }>(
    `/part/?search=${encodeURIComponent(search)}&limit=20`
  );
  return Array.isArray(data) ? data : data.results;
}

export async function getPartByIPN(ipn: string): Promise<Part | null> {
  const data = await request<Part[] | { results: Part[] }>(
    `/part/?IPN=${encodeURIComponent(ipn)}&limit=1`
  );
  const results = Array.isArray(data) ? data : data.results;
  return results[0] || null;
}

// --- Stock Locations ---

export async function getLocations(): Promise<StockLocation[]> {
  const data = await request<StockLocation[] | { results: StockLocation[] }>(
    "/stock/location/?structural=false&limit=100"
  );
  return Array.isArray(data) ? data : data.results;
}

export async function getLocation(pk: number): Promise<StockLocation> {
  return request<StockLocation>(`/stock/location/${pk}/`);
}

// --- Stock Items ---

export async function getStockForPart(
  partPk: number,
  locationPk?: number
): Promise<StockItem[]> {
  let url = `/stock/?part=${partPk}&limit=100&location_detail=true&part_detail=true`;
  if (locationPk) url += `&location=${locationPk}`;
  const data = await request<StockItem[] | { results: StockItem[] }>(url);
  return Array.isArray(data) ? data : data.results;
}

export async function getStockItem(pk: number): Promise<StockItem> {
  return request<StockItem>(`/stock/${pk}/`);
}

// --- Stock Operations ---

export async function addStock(
  items: Array<{ pk: number; quantity: number }>
): Promise<void> {
  // InvenTree bulk add stock endpoint
  await request("/stock/add/", {
    method: "POST",
    body: JSON.stringify({
      items: items.map((i) => ({
        pk: i.pk,
        quantity: i.quantity,
      })),
      notes: "Inbound via Scan Workstation",
    }),
  });
}

export async function removeStock(
  items: Array<{ pk: number; quantity: number }>
): Promise<void> {
  await request("/stock/remove/", {
    method: "POST",
    body: JSON.stringify({
      items: items.map((i) => ({
        pk: i.pk,
        quantity: i.quantity,
      })),
      notes: "Outbound via Scan Workstation",
    }),
  });
}

export async function transferStock(
  items: Array<{ pk: number; quantity: number }>,
  locationPk: number
): Promise<void> {
  await request("/stock/transfer/", {
    method: "POST",
    body: JSON.stringify({
      items: items.map((i) => ({
        pk: i.pk,
        quantity: i.quantity,
      })),
      location: locationPk,
      notes: "Transfer via Scan Workstation",
    }),
  });
}

export async function countStock(
  items: Array<{ pk: number; quantity: number }>
): Promise<void> {
  await request("/stock/count/", {
    method: "POST",
    body: JSON.stringify({
      items: items.map((i) => ({
        pk: i.pk,
        quantity: i.quantity,
      })),
      notes: "Stocktake via Scan Workstation",
    }),
  });
}

// --- Create new stock item (for inbound with no existing stock) ---

export async function createStockItem(data: {
  part: number;
  location: number;
  quantity: number;
  batch?: string;
}): Promise<StockItem> {
  return request<StockItem>("/stock/", {
    method: "POST",
    body: JSON.stringify({
      ...data,
      notes: "Created via Scan Workstation",
    }),
  });
}
