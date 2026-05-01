from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from auth import auth_router, users_router
from pos_routes import (
    categories_router, menu_router, tables_router, orders_router,
    agg_router, reports_router, settings_router, sync_router,
)
from ai_assistant import ai_router
from seed import seed_all, write_test_credentials


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("pos")

app = FastAPI(title="Restaurant POS API")

# Mongo
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
app.state.db = db
app.state.mongo_client = client


@app.get("/api/")
async def health():
    return {"ok": True, "service": "restaurant-pos"}


@app.get("/api/health")
async def healthcheck():
    try:
        await db.command("ping")
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


# Routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(categories_router)
app.include_router(menu_router)
app.include_router(tables_router)
app.include_router(orders_router)
app.include_router(agg_router)
app.include_router(reports_router)
app.include_router(settings_router)
app.include_router(sync_router)
app.include_router(ai_router)


@app.on_event("startup")
async def startup_event():
    try:
        await db.users.create_index("email", unique=True)
        await db.orders.create_index("created_at")
        await db.orders.create_index("client_id")
        await db.orders.create_index("aggregator_order_id")
        await db.tables.create_index("number", unique=True)
        await seed_all(db)
        await write_test_credentials()
        logger.info("Seed complete")
    except Exception as e:
        logger.exception(f"Startup error: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    client.close()


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
