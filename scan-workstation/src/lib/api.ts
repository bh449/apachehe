// InvenTree API client for the scan workstation

import type {
  Part,
  StockLocation,
  StockItem,
  BarcodeScanResult,
  RawBarcodeScanResult,
} from "./types";

const API_BASE = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/inventree`;

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
    const text = await res.text().catch(() => "");
    let message = `请求失败 (${res.status})`;
    try {
      const json = JSON.parse(text);
      message = parseApiError(json);
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  return res.json();
}

/** Convert InvenTree's structured error JSON into a human-readable string. */
function parseApiError(json: unknown): string {
  if (typeof json === "string") return json;
  if (typeof json !== "object" || json === null) return "未知错误";

  const obj = json as Record<string, unknown>;

  // Top-level "detail" or "error"
  if (typeof obj.detail === "string") return obj.detail;
  if (typeof obj.error === "string") return obj.error;

  // items array errors: { items: [ { pk: ["Invalid pk..."] } ] }
  if (Array.isArray(obj.items)) {
    for (const item of obj.items) {
      if (item && typeof item === "object") {
        const itemObj = item as Record<string, unknown>;
        if (Array.isArray(itemObj.pk)) {
          const msg = itemObj.pk[0];
          if (typeof msg === "string" && msg.includes("does not exist")) {
            return "库存条目已不存在（可能已被合并或删除），请重新扫描商品刷新数据";
          }
          return `库存条目错误: ${itemObj.pk[0]}`;
        }
        // Any other field errors
        for (const [field, errors] of Object.entries(itemObj)) {
          if (Array.isArray(errors) && errors.length > 0) {
            return `字段 "${field}" 错误: ${errors[0]}`;
          }
        }
      }
    }
  }

  // Generic field errors
  for (const [field, errors] of Object.entries(obj)) {
    if (Array.isArray(errors) && errors.length > 0) {
      return `${field}: ${errors[0]}`;
    }
  }

  return JSON.stringify(json);
}

/**
 * Verify a stock item pk still exists before a mutation.
 * Throws a user-friendly error if it doesn't.
 */
export async function validateStockItem(pk: number): Promise<StockItem> {
  try {
    return await request<StockItem>(`/stock/${pk}/`);
  } catch {
    throw new Error(
      `库存条目 #${pk} 已不存在（可能已被合并或删除）。请清空列表，重新扫描商品后再操作。`
    );
  }
}

// --- Barcode ---

export async function scanBarcode(barcode: string): Promise<BarcodeScanResult> {
  // Try the barcode as-is first
  const result = await tryScanBarcode(barcode);
  if (result.success) return result;

  // UPC-A (12 digits) ↔ EAN-13 (13 digits) auto-conversion:
  // Many barcode scanners return UPC-A as EAN-13 by prepending "0".
  // If the first attempt failed, try the alternate format.
  const alt = upcEanAlternate(barcode);
  if (alt) {
    const altResult = await tryScanBarcode(alt);
    if (altResult.success) return altResult;
  }

  return result; // Return the original error
}

/** If barcode is 12-digit UPC-A, return 13-digit EAN-13 (prepend 0), and vice versa */
function upcEanAlternate(barcode: string): string | null {
  if (/^\d{12}$/.test(barcode)) return "0" + barcode;          // UPC-A → EAN-13
  if (/^0\d{12}$/.test(barcode)) return barcode.substring(1);  // EAN-13 → UPC-A
  return null;
}

async function tryScanBarcode(barcode: string): Promise<BarcodeScanResult> {
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

/**
 * Merge-transfer: move N units from source stock item to an existing
 * destination stock item (instead of creating a new entry).
 *
 * Implemented as: removeStock(source, N) + addStock(dest, N)
 * This keeps both stock items intact but shifts the quantity.
 */
export async function mergeTransferStock(
  sourceStockPk: number,
  destStockPk: number,
  quantity: number
): Promise<void> {
  await request("/stock/remove/", {
    method: "POST",
    body: JSON.stringify({
      items: [{ pk: sourceStockPk, quantity }],
      notes: "Transfer (merge) via Scan Workstation",
    }),
  });
  await request("/stock/add/", {
    method: "POST",
    body: JSON.stringify({
      items: [{ pk: destStockPk, quantity }],
      notes: "Transfer (merge) via Scan Workstation",
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
