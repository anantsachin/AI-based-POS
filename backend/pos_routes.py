"""POS business routes: menu, tables, orders, aggregator, reports."""
import os
import uuid
import random
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, Field

from auth import get_current_user, require_roles


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Models ----------
class CategoryIn(BaseModel):
    name: str
    sort_order: int = 0


class CategoryOut(CategoryIn):
    id: str


class MenuItemIn(BaseModel):
    name: str
    category_id: str
    price: float
    image_url: Optional[str] = ""
    available: bool = True
    tax_rate: float = 5.0


class MenuItemOut(MenuItemIn):
    id: str


class TableIn(BaseModel):
    number: int
    capacity: int = 4


class TableOut(BaseModel):
    id: str
    number: int
    capacity: int
    status: str
    current_order_id: Optional[str] = None


class OrderItemIn(BaseModel):
    menu_item_id: str
    name: str
    price: float
    quantity: int
    notes: Optional[str] = ""


class OrderIn(BaseModel):
    channel: str = "dine-in"  # dine-in | takeaway | swiggy | zomato
    table_id: Optional[str] = None
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""
    items: List[OrderItemIn]
    notes: Optional[str] = ""
    # offline sync helper
    client_id: Optional[str] = None
    created_at: Optional[str] = None


class OrderUpdateStatus(BaseModel):
    status: str  # new | preparing | ready | served | dispatched | completed | cancelled


class OrderPayment(BaseModel):
    payment_method: str  # cash | upi | card
    amount_paid: float


class SettingsIn(BaseModel):
    restaurant_name: str
    address: str
    phone: str
    tax_rate: float
    service_charge: float
    currency: str
    currency_symbol: str


# ---------- Helpers ----------
def _calc_totals(items: List[dict], tax_rate: float, service_charge: float):
    subtotal = sum(i["price"] * i["quantity"] for i in items)
    tax = round(subtotal * tax_rate / 100, 2)
    service = round(subtotal * service_charge / 100, 2)
    total = round(subtotal + tax + service, 2)
    return round(subtotal, 2), tax, service, total


async def _build_order_doc(db, payload: OrderIn, created_by: str):
    settings = await db.settings.find_one({"id": "default"}, {"_id": 0}) or {
        "tax_rate": 5.0, "service_charge": 0.0
    }
    items = [i.model_dump() for i in payload.items]
    subtotal, tax, service, total = _calc_totals(items, settings["tax_rate"], settings["service_charge"])
    order_id = str(uuid.uuid4())
    return {
        "id": order_id,
        "client_id": payload.client_id,
        "order_number": f"#{datetime.now().strftime('%y%m%d')}-{random.randint(1000,9999)}",
        "channel": payload.channel,
        "table_id": payload.table_id,
        "customer_name": payload.customer_name or "",
        "customer_phone": payload.customer_phone or "",
        "items": items,
        "subtotal": subtotal,
        "tax": tax,
        "service_charge": service,
        "total": total,
        "status": "new",
        "payment_status": "pending",
        "payment_method": None,
        "amount_paid": 0.0,
        "notes": payload.notes or "",
        "created_by": created_by,
        "created_at": payload.created_at or now_iso(),
        "updated_at": now_iso(),
    }


# ---------- Routers ----------
categories_router = APIRouter(prefix="/api/categories", tags=["categories"])
menu_router = APIRouter(prefix="/api/menu-items", tags=["menu"])
tables_router = APIRouter(prefix="/api/tables", tags=["tables"])
orders_router = APIRouter(prefix="/api/orders", tags=["orders"])
agg_router = APIRouter(prefix="/api/aggregator", tags=["aggregator"])
reports_router = APIRouter(prefix="/api/reports", tags=["reports"])
settings_router = APIRouter(prefix="/api/settings", tags=["settings"])
sync_router = APIRouter(prefix="/api/sync", tags=["sync"])


# ===== Categories =====
@categories_router.get("", response_model=List[CategoryOut])
async def list_categories(request: Request, _: dict = Depends(get_current_user)):
    db = request.app.state.db
    items = await db.categories.find({}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return items


@categories_router.post("", response_model=CategoryOut)
async def create_category(payload: CategoryIn, request: Request, _: dict = Depends(require_roles("admin"))):
    db = request.app.state.db
    doc = {"id": str(uuid.uuid4()), **payload.model_dump(), "created_at": now_iso()}
    await db.categories.insert_one(doc)
    return CategoryOut(id=doc["id"], name=doc["name"], sort_order=doc["sort_order"])


@categories_router.put("/{cat_id}", response_model=CategoryOut)
async def update_category(cat_id: str, payload: CategoryIn, request: Request, _: dict = Depends(require_roles("admin"))):
    db = request.app.state.db
    res = await db.categories.update_one({"id": cat_id}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Category not found")
    return CategoryOut(id=cat_id, **payload.model_dump())


@categories_router.delete("/{cat_id}")
async def delete_category(cat_id: str, request: Request, _: dict = Depends(require_roles("admin"))):
    db = request.app.state.db
    await db.categories.delete_one({"id": cat_id})
    await db.menu_items.delete_many({"category_id": cat_id})
    return {"ok": True}


# ===== Menu items =====
@menu_router.get("", response_model=List[MenuItemOut])
async def list_menu_items(request: Request, _: dict = Depends(get_current_user)):
    db = request.app.state.db
    items = await db.menu_items.find({}, {"_id": 0}).to_list(2000)
    return items


@menu_router.post("", response_model=MenuItemOut)
async def create_menu_item(payload: MenuItemIn, request: Request, _: dict = Depends(require_roles("admin"))):
    db = request.app.state.db
    doc = {"id": str(uuid.uuid4()), **payload.model_dump(), "created_at": now_iso()}
    await db.menu_items.insert_one(doc)
    return MenuItemOut(id=doc["id"], **payload.model_dump())


@menu_router.put("/{item_id}", response_model=MenuItemOut)
async def update_menu_item(item_id: str, payload: MenuItemIn, request: Request, _: dict = Depends(require_roles("admin"))):
    db = request.app.state.db
    res = await db.menu_items.update_one({"id": item_id}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Item not found")
    return MenuItemOut(id=item_id, **payload.model_dump())


@menu_router.delete("/{item_id}")
async def delete_menu_item(item_id: str, request: Request, _: dict = Depends(require_roles("admin"))):
    db = request.app.state.db
    await db.menu_items.delete_one({"id": item_id})
    return {"ok": True}


# ===== Tables =====
@tables_router.get("", response_model=List[TableOut])
async def list_tables(request: Request, _: dict = Depends(get_current_user)):
    db = request.app.state.db
    items = await db.tables.find({}, {"_id": 0}).sort("number", 1).to_list(200)
    return items


@tables_router.post("", response_model=TableOut)
async def create_table(payload: TableIn, request: Request, _: dict = Depends(require_roles("admin"))):
    db = request.app.state.db
    if await db.tables.find_one({"number": payload.number}):
        raise HTTPException(400, "Table number already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "number": payload.number,
        "capacity": payload.capacity,
        "status": "available",
        "current_order_id": None,
        "created_at": now_iso(),
    }
    await db.tables.insert_one(doc)
    return TableOut(**{k: doc[k] for k in ["id", "number", "capacity", "status", "current_order_id"]})


@tables_router.delete("/{table_id}")
async def delete_table(table_id: str, request: Request, _: dict = Depends(require_roles("admin"))):
    db = request.app.state.db
    await db.tables.delete_one({"id": table_id})
    return {"ok": True}


# ===== Orders =====
@orders_router.get("")
async def list_orders(
    request: Request,
    channel: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 200,
    _: dict = Depends(get_current_user),
):
    db = request.app.state.db
    q: dict = {}
    if channel:
        q["channel"] = channel
    if status:
        q["status"] = status
    items = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items


@orders_router.get("/{order_id}")
async def get_order(order_id: str, request: Request, _: dict = Depends(get_current_user)):
    db = request.app.state.db
    o = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    return o


@orders_router.post("")
async def create_order(payload: OrderIn, request: Request, user: dict = Depends(get_current_user)):
    db = request.app.state.db
    if not payload.items:
        raise HTTPException(400, "At least one item required")
    # Idempotency on client_id (offline sync)
    if payload.client_id:
        existing = await db.orders.find_one({"client_id": payload.client_id}, {"_id": 0})
        if existing:
            return existing
    doc = await _build_order_doc(db, payload, user["id"])
    await db.orders.insert_one(doc)
    if payload.channel == "dine-in" and payload.table_id:
        await db.tables.update_one(
            {"id": payload.table_id},
            {"$set": {"status": "occupied", "current_order_id": doc["id"]}},
        )
    doc.pop("_id", None)
    return doc


@orders_router.put("/{order_id}/status")
async def update_status(order_id: str, payload: OrderUpdateStatus, request: Request, _: dict = Depends(get_current_user)):
    db = request.app.state.db
    valid = {"new", "preparing", "ready", "served", "dispatched", "completed", "cancelled"}
    if payload.status not in valid:
        raise HTTPException(400, "Invalid status")
    res = await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": payload.status, "updated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Order not found")
    if payload.status in ("completed", "cancelled"):
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if order and order.get("table_id"):
            await db.tables.update_one(
                {"id": order["table_id"]},
                {"$set": {"status": "available", "current_order_id": None}},
            )
    return {"ok": True, "status": payload.status}


@orders_router.post("/{order_id}/payment")
async def take_payment(order_id: str, payload: OrderPayment, request: Request, _: dict = Depends(get_current_user)):
    db = request.app.state.db
    o = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if payload.payment_method not in ("cash", "upi", "card"):
        raise HTTPException(400, "Invalid payment method")
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "payment_status": "paid",
            "payment_method": payload.payment_method,
            "amount_paid": payload.amount_paid,
            "status": "completed",
            "updated_at": now_iso(),
        }},
    )
    if o.get("table_id"):
        await db.tables.update_one(
            {"id": o["table_id"]},
            {"$set": {"status": "available", "current_order_id": None}},
        )
    return {"ok": True}


# ===== Aggregator (Swiggy / Zomato) =====
SAMPLE_CUSTOMERS = [
    ("Rahul Sharma", "+91 9876543210"),
    ("Priya Singh", "+91 9123456780"),
    ("Arjun Mehta", "+91 9988776655"),
    ("Sneha Verma", "+91 9012345678"),
    ("Vikram Reddy", "+91 9445566778"),
]


@agg_router.post("/simulate")
async def simulate_aggregator_order(
    request: Request,
    source: str = Query("swiggy", regex="^(swiggy|zomato)$"),
    user: dict = Depends(get_current_user),
):
    """Generate a fake incoming order from Swiggy or Zomato (for demo)."""
    db = request.app.state.db
    items = await db.menu_items.find({"available": True}, {"_id": 0}).to_list(200)
    if not items:
        raise HTTPException(400, "No menu items available")
    chosen = random.sample(items, min(3, len(items)))
    order_items = [
        OrderItemIn(menu_item_id=ci["id"], name=ci["name"], price=ci["price"],
                    quantity=random.randint(1, 2), notes="")
        for ci in chosen
    ]
    name, phone = random.choice(SAMPLE_CUSTOMERS)
    payload = OrderIn(
        channel=source,
        table_id=None,
        customer_name=name,
        customer_phone=phone,
        items=order_items,
        notes=f"Auto-generated {source} order",
    )
    doc = await _build_order_doc(db, payload, user["id"])
    doc["aggregator_order_id"] = f"{source.upper()}-{random.randint(100000, 999999)}"
    await db.orders.insert_one(doc)
    doc.pop("_id", None)
    return doc


@agg_router.post("/webhook/{source}")
async def aggregator_webhook(source: str, request: Request):
    """Real webhook endpoint placeholder for Swiggy/Zomato partner integrations.
    Accepts a normalized payload and creates an order. No auth (verify signature in prod)."""
    if source not in ("swiggy", "zomato"):
        raise HTTPException(400, "Invalid source")
    db = request.app.state.db
    body = await request.json()
    aggregator_order_id = body.get("aggregator_order_id") or body.get("order_id") or f"{source.upper()}-{uuid.uuid4().hex[:8]}"
    if await db.orders.find_one({"aggregator_order_id": aggregator_order_id}):
        return {"ok": True, "duplicate": True}
    raw_items = body.get("items", [])
    items = [{
        "menu_item_id": i.get("menu_item_id", ""),
        "name": i.get("name", ""),
        "price": float(i.get("price", 0)),
        "quantity": int(i.get("quantity", 1)),
        "notes": i.get("notes", ""),
    } for i in raw_items]
    payload = OrderIn(
        channel=source,
        customer_name=body.get("customer_name", "Aggregator Customer"),
        customer_phone=body.get("customer_phone", ""),
        items=[OrderItemIn(**i) for i in items] if items else [],
        notes=body.get("notes", ""),
    )
    if not items:
        raise HTTPException(400, "items required")
    doc = await _build_order_doc(db, payload, "aggregator")
    doc["aggregator_order_id"] = aggregator_order_id
    await db.orders.insert_one(doc)
    return {"ok": True, "order_id": doc["id"]}


# ===== Reports =====
@reports_router.get("/sales")
async def sales_report(
    request: Request,
    days: int = 7,
    _: dict = Depends(get_current_user),
):
    db = request.app.state.db
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    orders = await db.orders.find(
        {"created_at": {"$gte": since}, "status": {"$ne": "cancelled"}},
        {"_id": 0},
    ).to_list(5000)

    total_revenue = sum(o["total"] for o in orders)
    total_orders = len(orders)
    avg_order = (total_revenue / total_orders) if total_orders else 0

    # Channel split
    channels = {}
    for o in orders:
        ch = o.get("channel", "dine-in")
        channels.setdefault(ch, {"revenue": 0, "orders": 0})
        channels[ch]["revenue"] += o["total"]
        channels[ch]["orders"] += 1

    # Payment method split
    payments = {}
    for o in orders:
        pm = o.get("payment_method") or "pending"
        payments.setdefault(pm, 0)
        payments[pm] += o["total"]

    # Top items
    item_counts: dict = {}
    for o in orders:
        for it in o.get("items", []):
            key = it["name"]
            item_counts.setdefault(key, {"qty": 0, "revenue": 0})
            item_counts[key]["qty"] += it["quantity"]
            item_counts[key]["revenue"] += it["price"] * it["quantity"]
    top_items = sorted(
        [{"name": k, **v} for k, v in item_counts.items()],
        key=lambda x: x["qty"], reverse=True,
    )[:10]

    # Daily revenue trend
    daily: dict = {}
    for o in orders:
        d = o["created_at"][:10]
        daily.setdefault(d, 0)
        daily[d] += o["total"]
    trend = sorted([{"date": k, "revenue": round(v, 2)} for k, v in daily.items()], key=lambda x: x["date"])

    return {
        "total_revenue": round(total_revenue, 2),
        "total_orders": total_orders,
        "avg_order_value": round(avg_order, 2),
        "channel_split": [{"channel": k, **v} for k, v in channels.items()],
        "payment_split": [{"method": k, "amount": round(v, 2)} for k, v in payments.items()],
        "top_items": top_items,
        "trend": trend,
    }


# ===== Settings =====
@settings_router.get("")
async def get_settings(request: Request, _: dict = Depends(get_current_user)):
    db = request.app.state.db
    s = await db.settings.find_one({"id": "default"}, {"_id": 0})
    return s


@settings_router.put("")
async def update_settings(payload: SettingsIn, request: Request, _: dict = Depends(require_roles("admin"))):
    db = request.app.state.db
    await db.settings.update_one(
        {"id": "default"},
        {"$set": payload.model_dump()},
        upsert=True,
    )
    s = await db.settings.find_one({"id": "default"}, {"_id": 0})
    return s


# ===== Offline sync =====
class SyncIn(BaseModel):
    orders: List[OrderIn]


@sync_router.post("")
async def sync_offline(payload: SyncIn, request: Request, user: dict = Depends(get_current_user)):
    db = request.app.state.db
    created = []
    skipped = []
    for o in payload.orders:
        if o.client_id:
            existing = await db.orders.find_one({"client_id": o.client_id}, {"_id": 0})
            if existing:
                skipped.append(existing["id"])
                continue
        if not o.items:
            continue
        doc = await _build_order_doc(db, o, user["id"])
        await db.orders.insert_one(doc)
        if o.channel == "dine-in" and o.table_id:
            await db.tables.update_one(
                {"id": o.table_id},
                {"$set": {"status": "occupied", "current_order_id": doc["id"]}},
            )
        created.append(doc["id"])
    return {"created": created, "skipped": skipped}
