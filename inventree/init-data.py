#!/usr/bin/env python3
"""
InvenTree Initial Data Seeder
=============================
Seeds the system with:
  - Warehouse / Location tree (4 levels)
  - Part categories
  - Sample parts with barcodes
  - Sample stock

Usage:
  pip install requests
  python init-data.py

Requires InvenTree to be running at http://localhost:1880
"""

import sys
import json
import requests

# --- Configuration ---
BASE_URL = "http://localhost:1880"
API_URL = f"{BASE_URL}/api"
USERNAME = "admin"
PASSWORD = None  # Will be read from .env or prompted

# --- Helpers ---

class InvenTreeAPI:
    def __init__(self, base_url, username, password):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session = requests.Session()
        self._authenticate(username, password)

    def _authenticate(self, username, password):
        """Get API token via basic auth."""
        resp = self.session.get(
            f"{self.api_url}/user/token/",
            auth=(username, password),
            headers={"Accept": "application/json"},
        )
        if resp.status_code != 200:
            print(f"[ERROR] Authentication failed (HTTP {resp.status_code})")
            print(f"  Response: {resp.text[:200]}")
            sys.exit(1)
        token = resp.json().get("token")
        if not token:
            print("[ERROR] No token in response")
            sys.exit(1)
        self.session.headers.update({
            "Authorization": f"Token {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        })
        print(f"[OK] Authenticated as '{username}'")

    def get(self, endpoint, params=None):
        resp = self.session.get(f"{self.api_url}/{endpoint}/", params=params)
        resp.raise_for_status()
        return resp.json()

    def post(self, endpoint, data):
        resp = self.session.post(f"{self.api_url}/{endpoint}/", json=data)
        if resp.status_code not in (200, 201):
            print(f"  [WARN] POST {endpoint} -> {resp.status_code}: {resp.text[:200]}")
            return None
        return resp.json()

    def list_all(self, endpoint, params=None):
        """Handle paginated results."""
        results = []
        url = f"{self.api_url}/{endpoint}/"
        while url:
            resp = self.session.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                return data
            results.extend(data.get("results", []))
            url = data.get("next")
            params = None  # params only for first request
        return results


def find_or_create(api, endpoint, search_field, search_value, create_data):
    """Find existing record or create new one."""
    existing = api.list_all(endpoint, {search_field: search_value})
    for item in existing:
        if item.get(search_field) == search_value:
            print(f"  [EXISTS] {endpoint}: {search_value}")
            return item
    result = api.post(endpoint, create_data)
    if result:
        print(f"  [CREATED] {endpoint}: {search_value}")
    return result


# --- Data Definitions ---

# Location tree: Warehouse > Area > Rack > Bin
LOCATION_TREE = {
    "Home Warehouse": {
        "description": "Main home/workshop storage",
        "children": {
            "Room-A": {
                "description": "Room A - Main storage area",
                "children": {
                    "Rack-A1": {
                        "description": "Rack A1",
                        "children": {
                            "Bin-A1-01": {"description": "Bin A1-01"},
                            "Bin-A1-02": {"description": "Bin A1-02"},
                            "Bin-A1-03": {"description": "Bin A1-03"},
                        }
                    },
                    "Rack-A2": {
                        "description": "Rack A2",
                        "children": {
                            "Bin-A2-01": {"description": "Bin A2-01"},
                            "Bin-A2-02": {"description": "Bin A2-02"},
                        }
                    },
                }
            },
            "Room-B": {
                "description": "Room B - Secondary storage",
                "children": {
                    "Rack-B1": {
                        "description": "Rack B1",
                        "children": {
                            "Bin-B1-01": {"description": "Bin B1-01"},
                            "Bin-B1-02": {"description": "Bin B1-02"},
                        }
                    },
                }
            },
            "Packing-Area": {
                "description": "Temporary packing/staging area",
                "children": {
                    "Pack-Station-1": {"description": "Packing station 1"},
                }
            },
        }
    }
}

# Part categories
CATEGORIES = [
    {"name": "Raw Materials", "description": "Raw materials and supplies"},
    {"name": "Finished Goods", "description": "Finished products ready for sale"},
    {"name": "Packaging", "description": "Packaging materials"},
    {"name": "Tools", "description": "Tools and equipment"},
    {"name": "Consumables", "description": "Consumable supplies"},
]

# Sample parts (SKUs)
SAMPLE_PARTS = [
    {
        "name": "Handmade Soap - Lavender",
        "IPN": "SKU-SOAP-LAV-001",
        "description": "Handmade lavender soap, 100g bar",
        "category": "Finished Goods",
        "barcode": "6901234567001",
        "units": "pcs",
        "minimum_stock": 10,
    },
    {
        "name": "Handmade Soap - Rose",
        "IPN": "SKU-SOAP-ROSE-001",
        "description": "Handmade rose soap, 100g bar",
        "category": "Finished Goods",
        "barcode": "6901234567002",
        "units": "pcs",
        "minimum_stock": 10,
    },
    {
        "name": "Soap Base - Glycerin",
        "IPN": "SKU-RAW-GLYC-001",
        "description": "Glycerin soap base, 1kg block",
        "category": "Raw Materials",
        "barcode": "6901234567101",
        "units": "kg",
        "minimum_stock": 5,
    },
    {
        "name": "Kraft Box 10x10x5",
        "IPN": "SKU-PKG-BOX-001",
        "description": "Kraft paper gift box, 10x10x5cm",
        "category": "Packaging",
        "barcode": "6901234567201",
        "units": "pcs",
        "minimum_stock": 50,
    },
    {
        "name": "Lavender Essential Oil 10ml",
        "IPN": "SKU-RAW-LEO-001",
        "description": "Pure lavender essential oil, 10ml bottle",
        "category": "Raw Materials",
        "barcode": "6901234567102",
        "units": "pcs",
        "minimum_stock": 3,
    },
]


# --- Seeding Functions ---

def seed_locations(api, tree, parent_id=None, depth=0):
    """Recursively create location tree."""
    indent = "  " * depth
    location_ids = {}

    for name, info in tree.items():
        data = {
            "name": name,
            "description": info.get("description", ""),
            "structural": bool(info.get("children")),  # non-leaf = structural
        }
        if parent_id:
            data["parent"] = parent_id

        result = find_or_create(api, "stock/location", "name", name, data)
        if result:
            loc_id = result["pk"]
            location_ids[name] = loc_id
            children = info.get("children", {})
            if children:
                child_ids = seed_locations(api, children, parent_id=loc_id, depth=depth+1)
                location_ids.update(child_ids)

    return location_ids


def seed_categories(api, categories, parent_id=None):
    """Create part categories."""
    cat_ids = {}
    for cat in categories:
        data = {"name": cat["name"], "description": cat.get("description", "")}
        if parent_id:
            data["parent"] = parent_id
        result = find_or_create(api, "part/category", "name", cat["name"], data)
        if result:
            cat_ids[cat["name"]] = result["pk"]
    return cat_ids


def seed_parts(api, parts, category_ids):
    """Create sample parts with barcodes."""
    part_ids = {}
    for part_data in parts:
        cat_id = category_ids.get(part_data["category"])
        data = {
            "name": part_data["name"],
            "IPN": part_data["IPN"],
            "description": part_data.get("description", ""),
            "category": cat_id,
            "active": True,
            "component": part_data["category"] == "Raw Materials",
            "purchaseable": True,
            "salable": part_data["category"] == "Finished Goods",
            "trackable": False,
            "minimum_stock": part_data.get("minimum_stock", 0),
            "units": part_data.get("units", "pcs"),
        }

        result = find_or_create(api, "part", "IPN", part_data["IPN"], data)
        if result:
            pk = result["pk"]
            part_ids[part_data["IPN"]] = pk

            # Assign barcode if specified
            if part_data.get("barcode"):
                barcode_data = {
                    "barcode": part_data["barcode"],
                }
                # Use the barcode assign endpoint
                resp = api.session.post(
                    f"{api.api_url}/barcode/link/",
                    json={"barcode": part_data["barcode"], "part": pk}
                )
                if resp.status_code in (200, 201):
                    print(f"  [BARCODE] {part_data['IPN']} -> {part_data['barcode']}")
                else:
                    # May already be assigned
                    print(f"  [BARCODE-SKIP] {part_data['IPN']}: {resp.text[:100]}")

    return part_ids


def seed_stock(api, part_ids, location_ids):
    """Add initial stock for sample parts."""
    stock_items = [
        {"part_ipn": "SKU-SOAP-LAV-001", "location": "Bin-A1-01", "quantity": 25},
        {"part_ipn": "SKU-SOAP-ROSE-001", "location": "Bin-A1-02", "quantity": 18},
        {"part_ipn": "SKU-RAW-GLYC-001", "location": "Bin-A2-01", "quantity": 10},
        {"part_ipn": "SKU-PKG-BOX-001", "location": "Bin-B1-01", "quantity": 100},
        {"part_ipn": "SKU-RAW-LEO-001", "location": "Bin-A2-02", "quantity": 5},
    ]

    for item in stock_items:
        part_pk = part_ids.get(item["part_ipn"])
        loc_pk = location_ids.get(item["location"])
        if not part_pk or not loc_pk:
            print(f"  [SKIP] Missing part or location for {item['part_ipn']}")
            continue

        data = {
            "part": part_pk,
            "location": loc_pk,
            "quantity": item["quantity"],
        }

        # Check if stock already exists for this part+location
        existing = api.list_all("stock", {"part": part_pk, "location": loc_pk})
        if existing:
            print(f"  [EXISTS] Stock: {item['part_ipn']} @ {item['location']}")
            continue

        result = api.post("stock", data)
        if result:
            print(f"  [STOCK] {item['part_ipn']} x{item['quantity']} -> {item['location']}")


# --- Main ---

def main():
    global PASSWORD

    # Try to read password from .env
    try:
        with open(".env", "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith("INVENTREE_ADMIN_PASSWORD="):
                    PASSWORD = line.split("=", 1)[1].strip()
                    break
    except FileNotFoundError:
        pass

    if not PASSWORD:
        PASSWORD = input("Enter admin password: ")

    print("")
    print("=== InvenTree Data Initialization ===")
    print(f"  Server: {BASE_URL}")
    print("")

    # Connect
    api = InvenTreeAPI(BASE_URL, USERNAME, PASSWORD)
    print("")

    # 1. Seed locations
    print("--- Creating Location Tree ---")
    location_ids = seed_locations(api, LOCATION_TREE)
    print(f"  Total locations: {len(location_ids)}")
    print("")

    # 2. Seed categories
    print("--- Creating Part Categories ---")
    category_ids = seed_categories(api, CATEGORIES)
    print(f"  Total categories: {len(category_ids)}")
    print("")

    # 3. Seed parts
    print("--- Creating Sample Parts ---")
    part_ids = seed_parts(api, SAMPLE_PARTS, category_ids)
    print(f"  Total parts: {len(part_ids)}")
    print("")

    # 4. Seed stock
    print("--- Adding Initial Stock ---")
    seed_stock(api, part_ids, location_ids)
    print("")

    print("=== Initialization Complete ===")
    print(f"  Open {BASE_URL} to start using InvenTree")
    print("")
    print("  Next steps:")
    print("  1. Log in with admin / (your password)")
    print("  2. Try scanning a barcode: 6901234567001")
    print("  3. Check Stock > Stock Items to see inventory")
    print("  4. Check Stock > Locations to see the warehouse tree")


if __name__ == "__main__":
    main()
