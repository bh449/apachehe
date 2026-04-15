// InvenTree API types for the scan workstation

export interface Part {
  pk: number;
  IPN: string;
  name: string;
  description: string;
  category: number | null;
  category_detail?: { pk: number; name: string };
  image: string | null;
  active: boolean;
  units: string;
  minimum_stock: number;
  in_stock: number;
  barcode_hash?: string;
}

export interface StockLocation {
  pk: number;
  name: string;
  description: string;
  parent: number | null;
  pathstring: string;
  structural: boolean;
  items: number;
}

export interface StockItem {
  pk: number;
  part: number;
  part_detail?: Part;
  location: number | null;
  location_detail?: StockLocation;
  quantity: number;
  batch: string;
  serial: string;
  status: number;
  status_text?: string;
}

// Raw response from InvenTree barcode API (nested structure)
export interface RawBarcodePartRef {
  pk: number;
  api_url: string;
  web_url: string;
  instance: Part;
}

export interface RawBarcodeStockItemRef {
  pk: number;
  api_url: string;
  web_url: string;
  instance: StockItem;
}

export interface RawBarcodeLocationRef {
  pk: number;
  api_url: string;
  web_url: string;
  instance: StockLocation;
}

export interface RawBarcodeScanResult {
  barcode_data: string;
  barcode_hash: string;
  part?: RawBarcodePartRef;
  stockitem?: RawBarcodeStockItemRef;
  stocklocation?: RawBarcodeLocationRef;
  success?: string;
  error?: string;
  plugin?: string;
}

// Normalized result (what components use)
export interface BarcodeScanResult {
  barcode_data: string;
  barcode_hash: string;
  part?: Part;
  stockitem?: StockItem;
  stocklocation?: StockLocation;
  success?: boolean;
  error?: string;
  plugin?: string;
}

export interface StockTracking {
  pk: number;
  item: number;
  date: string;
  label: string;
  notes: string;
  deltas: Record<string, unknown>;
  user: number;
  user_detail?: { pk: number; username: string };
}

// Scan workstation types

export type ScanMode = "lookup" | "inbound" | "outbound" | "transfer" | "stocktake";

export interface ScanLineItem {
  id: string; // client-side unique id
  part: Part;
  quantity: number;
  location?: StockLocation;
  stockItem?: StockItem; // for outbound - reference to existing stock
}

export interface FlashMessage {
  type: "success" | "error" | "warning";
  text: string;
}
