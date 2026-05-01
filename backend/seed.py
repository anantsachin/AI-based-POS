"""Seed sample data on startup so the POS demo is usable immediately."""
import os
import uuid
from datetime import datetime, timezone
from auth import hash_password


def _now():
    return datetime.now(timezone.utc).isoformat()


SAMPLE_CATEGORIES = [
    {"name": "Starters", "sort_order": 1},
    {"name": "Mains", "sort_order": 2},
    {"name": "Pizza", "sort_order": 3},
    {"name": "Burgers", "sort_order": 4},
    {"name": "Beverages", "sort_order": 5},
    {"name": "Desserts", "sort_order": 6},
]

SAMPLE_ITEMS = [
    # Starters
    ("Paneer Tikka", "Starters", 280, "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400"),
    ("Chicken 65", "Starters", 320, "https://images.unsplash.com/photo-1626777553635-2acb7a8a8e90?w=400"),
    ("Veg Spring Roll", "Starters", 220, "https://images.unsplash.com/photo-1544025162-d76694265947?w=400"),
    # Mains
    ("Butter Chicken", "Mains", 420, "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400"),
    ("Dal Makhani", "Mains", 260, "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400"),
    ("Veg Biryani", "Mains", 280, "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400"),
    ("Chicken Biryani", "Mains", 340, "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400"),
    # Pizza
    ("Margherita Pizza", "Pizza", 350, "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400"),
    ("Pepperoni Pizza", "Pizza", 480, "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400"),
    ("Farmhouse Pizza", "Pizza", 420, "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400"),
    # Burgers
    ("Classic Cheeseburger", "Burgers", 240, "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400"),
    ("Veggie Burger", "Burgers", 200, "https://images.unsplash.com/photo-1520072959219-c595dc870360?w=400"),
    ("Crispy Chicken Burger", "Burgers", 260, "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400"),
    # Beverages
    ("Fresh Lime Soda", "Beverages", 90, "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400"),
    ("Cold Coffee", "Beverages", 140, "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400"),
    ("Mango Lassi", "Beverages", 120, "https://images.unsplash.com/photo-1626202373052-9c5d2a9d6c0d?w=400"),
    # Desserts
    ("Gulab Jamun", "Desserts", 110, "https://images.unsplash.com/photo-1601001815853-3835274403b3?w=400"),
    ("Chocolate Brownie", "Desserts", 180, "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400"),
    ("Ice Cream Sundae", "Desserts", 160, "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400"),
]


async def seed_all(db):
    # --- Users ---
    admin_email = os.environ["ADMIN_EMAIL"].strip().lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Admin",
            "role": "admin",
            "password_hash": hash_password(admin_password),
            "created_at": _now(),
        })

    if not await db.users.find_one({"email": "cashier@pos.com"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": "cashier@pos.com",
            "name": "Sam Cashier",
            "role": "cashier",
            "password_hash": hash_password("cashier123"),
            "created_at": _now(),
        })
    if not await db.users.find_one({"email": "waiter@pos.com"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": "waiter@pos.com",
            "name": "Riya Waiter",
            "role": "waiter",
            "password_hash": hash_password("waiter123"),
            "created_at": _now(),
        })

    # --- Categories ---
    cat_map = {}
    for c in SAMPLE_CATEGORIES:
        existing_c = await db.categories.find_one({"name": c["name"]})
        if existing_c is None:
            cat_id = str(uuid.uuid4())
            await db.categories.insert_one({
                "id": cat_id,
                "name": c["name"],
                "sort_order": c["sort_order"],
                "created_at": _now(),
            })
            cat_map[c["name"]] = cat_id
        else:
            cat_map[c["name"]] = existing_c["id"]

    # --- Menu items ---
    for name, cat_name, price, image in SAMPLE_ITEMS:
        if not await db.menu_items.find_one({"name": name}):
            await db.menu_items.insert_one({
                "id": str(uuid.uuid4()),
                "name": name,
                "category_id": cat_map[cat_name],
                "price": price,
                "image_url": image,
                "available": True,
                "tax_rate": 5.0,
                "created_at": _now(),
            })

    # --- Tables ---
    if await db.tables.count_documents({}) == 0:
        for i in range(1, 13):
            await db.tables.insert_one({
                "id": str(uuid.uuid4()),
                "number": i,
                "capacity": 4 if i <= 8 else 6,
                "status": "available",  # available | occupied | billing
                "current_order_id": None,
                "created_at": _now(),
            })

    # --- Restaurant settings ---
    if not await db.settings.find_one({"id": "default"}):
        await db.settings.insert_one({
            "id": "default",
            "restaurant_name": "Spice Route Bistro",
            "address": "12 MG Road, Bengaluru",
            "phone": "+91 98765 43210",
            "tax_rate": 5.0,
            "service_charge": 0.0,
            "currency": "INR",
            "currency_symbol": "₹",
        })


async def write_test_credentials():
    """Update memory/test_credentials.md after seeding."""
    import pathlib
    memory_dir = pathlib.Path(__file__).parent.parent / "memory"
    memory_dir.mkdir(exist_ok=True)
    content = """# Restaurant POS - Test Credentials

## Admin
- Email: admin@pos.com
- Password: admin123
- Role: admin

## Cashier
- Email: cashier@pos.com
- Password: cashier123
- Role: cashier

## Waiter
- Email: waiter@pos.com
- Password: waiter123
- Role: waiter

## Auth Endpoints
- POST /api/auth/login (body: {email, password})
- POST /api/auth/logout
- GET  /api/auth/me  (requires Authorization: Bearer <token>)
"""
    with open(memory_dir / "test_credentials.md", "w") as f:
        f.write(content)
