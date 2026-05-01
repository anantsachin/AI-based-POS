"""AI Assistant for the Restaurant POS — Gemini via official Google GenAI SDK.

The assistant can answer natural-language questions about live POS data:
sales, orders, tables, menu, top items, slow movers, end-of-day summary.

Approach:
- /api/ai/chat: gather a JSON snapshot of the live POS state, embed it into the
  system prompt along with the last few conversation turns from MongoDB, then
  send the new user message via google-generativeai AsyncClient.
  All messages are persisted in `ai_messages`.
"""
import os
import uuid
import json
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel
import google.generativeai as genai

from auth import get_current_user


MODEL_NAME = "gemini-1.5-flash"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Context builder: snapshot of the POS data ----------
async def _build_context(db) -> dict:
    """Pull a compact JSON snapshot of the current restaurant state."""
    today = datetime.now(timezone.utc).date().isoformat()
    since_today = today + "T00:00:00+00:00"
    since_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    since_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    # Settings
    settings = await db.settings.find_one({"id": "default"}, {"_id": 0}) or {}

    # Tables
    tables = await db.tables.find({}, {"_id": 0}).sort("number", 1).to_list(200)
    table_summary = {
        "total": len(tables),
        "available": sum(1 for t in tables if t["status"] == "available"),
        "occupied": sum(1 for t in tables if t["status"] == "occupied"),
        "billing": sum(1 for t in tables if t["status"] == "billing"),
        "occupied_numbers": [t["number"] for t in tables if t["status"] == "occupied"],
    }

    # Active orders (kitchen)
    active_orders = await db.orders.find(
        {"status": {"$in": ["new", "preparing", "ready"]}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)

    # Today's orders
    today_orders = await db.orders.find(
        {"created_at": {"$gte": since_today}, "status": {"$ne": "cancelled"}},
        {"_id": 0},
    ).to_list(2000)

    # Last 7 days for analytics
    week_orders = await db.orders.find(
        {"created_at": {"$gte": since_7d}, "status": {"$ne": "cancelled"}},
        {"_id": 0},
    ).to_list(5000)

    # Last 30 days for slow-mover analysis
    month_orders = await db.orders.find(
        {"created_at": {"$gte": since_30d}, "status": {"$ne": "cancelled"}},
        {"_id": 0},
    ).to_list(10000)

    # Menu
    menu_items = await db.menu_items.find({}, {"_id": 0}).to_list(2000)

    def _summarize(orders):
        revenue = sum(o["total"] for o in orders)
        n = len(orders)
        channels: dict = {}
        payments: dict = {}
        for o in orders:
            ch = o.get("channel", "dine-in")
            channels.setdefault(ch, {"orders": 0, "revenue": 0.0})
            channels[ch]["orders"] += 1
            channels[ch]["revenue"] += o["total"]
            pm = o.get("payment_method") or "pending"
            payments.setdefault(pm, 0.0)
            payments[pm] += o["total"]
        items: dict = {}
        for o in orders:
            for it in o.get("items", []):
                items.setdefault(it["name"], {"qty": 0, "revenue": 0.0})
                items[it["name"]]["qty"] += it["quantity"]
                items[it["name"]]["revenue"] += it["price"] * it["quantity"]
        top = sorted(
            [{"name": k, **v} for k, v in items.items()],
            key=lambda x: x["qty"], reverse=True,
        )[:10]
        return {
            "revenue": round(revenue, 2),
            "orders": n,
            "avg_order": round(revenue / n, 2) if n else 0,
            "channels": {k: {"orders": v["orders"], "revenue": round(v["revenue"], 2)}
                         for k, v in channels.items()},
            "payments": {k: round(v, 2) for k, v in payments.items()},
            "top_items": top,
        }

    # Slow movers — items with low qty in last 30 days
    sold = {}
    for o in month_orders:
        for it in o.get("items", []):
            sold.setdefault(it["name"], 0)
            sold[it["name"]] += it["quantity"]
    slow_movers = []
    for m in menu_items:
        if not m.get("available"):
            continue
        slow_movers.append({"name": m["name"], "qty_30d": sold.get(m["name"], 0), "price": m["price"]})
    slow_movers.sort(key=lambda x: x["qty_30d"])

    return {
        "now": _now_iso(),
        "restaurant": {
            "name": settings.get("restaurant_name", "Restaurant"),
            "currency_symbol": settings.get("currency_symbol", "₹"),
            "tax_rate": settings.get("tax_rate", 5.0),
        },
        "tables": table_summary,
        "active_kitchen_orders": [
            {
                "order_number": o["order_number"], "channel": o["channel"],
                "status": o["status"], "total": o["total"],
                "items": [{"name": i["name"], "qty": i["quantity"]} for i in o["items"]],
                "table_id": o.get("table_id"),
                "customer_name": o.get("customer_name"),
            } for o in active_orders[:30]
        ],
        "today": _summarize(today_orders),
        "last_7_days": _summarize(week_orders),
        "menu_summary": {"total_items": len(menu_items),
                         "available": sum(1 for m in menu_items if m.get("available"))},
        "slow_movers_30d": slow_movers[:10],
    }


def _system_prompt(context: dict, currency: str) -> str:
    return f"""You are "Spice", the AI assistant embedded in a restaurant Point-of-Sale system.

You answer the manager's questions about LIVE restaurant data. Be concise, friendly, and direct. Use the currency symbol {currency} for money.

GUIDELINES
- Use ONLY the data in CONTEXT below. If something isn't there, say so honestly.
- Prefer short answers (2-5 sentences). Use bullet points or tiny tables when helpful.
- Numbers: round currency to whole units, qty to integers.
- For "summary"-type questions, structure: Headline → Key numbers → 1-2 actionable insights.
- For slow-movers / discount questions, suggest specific items from slow_movers_30d.
- For operational questions ("which tables are occupied", "kitchen status") cite the actual numbers.
- Don't invent items, prices, or channels. Don't mention CONTEXT or JSON to the user.

CONTEXT (JSON):
{json.dumps(context, default=str)}
"""


# ---------- Gemini async helper ----------
async def _call_gemini(api_key: str, system: str, messages: list) -> str:
    """Call Gemini via the official google-generativeai SDK."""
    import asyncio
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name=MODEL_NAME,
        system_instruction=system,
    )
    # Build history for multi-turn (all but last message)
    history = []
    for msg in messages[:-1]:
        role = "user" if msg["role"] == "user" else "model"
        history.append({"role": role, "parts": [msg["content"]]})

    chat = model.start_chat(history=history)
    # Send last message
    last_content = messages[-1]["content"] if messages else ""
    response = await asyncio.to_thread(chat.send_message, last_content)
    return response.text


# ---------- Schemas ----------
class ChatIn(BaseModel):
    session_id: Optional[str] = None
    message: str


class MessageOut(BaseModel):
    id: str
    session_id: str
    role: str
    text: str
    created_at: str


# ---------- Router ----------
ai_router = APIRouter(prefix="/api/ai", tags=["ai"])


@ai_router.post("/chat")
async def chat(payload: ChatIn, request: Request, user: dict = Depends(get_current_user)):
    db = request.app.state.db
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(500, "GEMINI_API_KEY not configured")

    text = (payload.message or "").strip()
    if not text:
        raise HTTPException(400, "message is required")

    session_id = payload.session_id or f"{user['id']}-{uuid.uuid4().hex[:8]}"

    # Persist user message
    user_msg = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "user_id": user["id"],
        "role": "user",
        "text": text,
        "created_at": _now_iso(),
    }
    await db.ai_messages.insert_one(user_msg)

    # Build context + system prompt
    context = await _build_context(db)
    sys_prompt = _system_prompt(context, context["restaurant"]["currency_symbol"])

    # Pull recent history for THIS session (excluding the just-inserted user msg)
    history = await db.ai_messages.find(
        {"session_id": session_id, "id": {"$ne": user_msg["id"]}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(8)
    history.reverse()

    # Build messages list for Gemini
    gemini_messages = []
    for h in history:
        role = "user" if h["role"] == "user" else "assistant"
        gemini_messages.append({"role": role, "content": h["text"]})
    gemini_messages.append({"role": "user", "content": text})

    response_text: str = ""
    try:
        response_text = await _call_gemini(api_key, sys_prompt, gemini_messages)
    except Exception as e:
        raise HTTPException(502, f"AI provider error: {e}") from e

    assistant_msg = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "user_id": user["id"],
        "role": "assistant",
        "text": response_text,
        "created_at": _now_iso(),
    }
    await db.ai_messages.insert_one(assistant_msg)

    return {
        "session_id": session_id,
        "reply": response_text,
        "message_id": assistant_msg["id"],
    }


@ai_router.post("/summary")
async def daily_summary(request: Request, user: dict = Depends(get_current_user)):
    """One-shot end-of-day summary using current context."""
    db = request.app.state.db
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(500, "GEMINI_API_KEY not configured")

    context = await _build_context(db)
    sys_prompt = _system_prompt(context, context["restaurant"]["currency_symbol"])
    session_id = f"summary-{user['id']}-{uuid.uuid4().hex[:6]}"

    prompt = (
        "Generate today's End-of-Day summary for the manager. Use this format:\n\n"
        "**Headline** — one bold sentence about how today went.\n"
        "**Numbers**\n- Revenue today\n- Orders today\n- Avg order value\n"
        "- Channel breakdown (dine-in/takeaway/swiggy/zomato)\n"
        "**Top performers** — top 3 items today (or this week if today has none).\n"
        "**Operations** — current kitchen load + table occupancy.\n"
        "**Recommendations** — 2 short, specific actions for tomorrow."
    )

    try:
        reply = await _call_gemini(api_key, sys_prompt, [{"role": "user", "content": prompt}])
    except Exception as e:
        raise HTTPException(502, f"AI provider error: {e}")

    return {"session_id": session_id, "summary": reply}


@ai_router.get("/sessions/{session_id}/messages", response_model=List[MessageOut])
async def session_messages(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    db = request.app.state.db
    msgs = await db.ai_messages.find(
        {"session_id": session_id, "user_id": user["id"]},
        {"_id": 0, "user_id": 0},
    ).sort("created_at", 1).to_list(500)
    return msgs


@ai_router.get("/sessions")
async def list_sessions(request: Request, user: dict = Depends(get_current_user)):
    """Return distinct sessions for this user with the last message preview."""
    db = request.app.state.db
    pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$session_id",
            "last_text": {"$first": "$text"},
            "last_role": {"$first": "$role"},
            "last_at": {"$first": "$created_at"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"last_at": -1}},
        {"$limit": 30},
    ]
    rows = await db.ai_messages.aggregate(pipeline).to_list(30)
    return [
        {"session_id": r["_id"], "last_text": r["last_text"],
         "last_role": r["last_role"], "last_at": r["last_at"], "count": r["count"]}
        for r in rows
    ]


@ai_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    db = request.app.state.db
    res = await db.ai_messages.delete_many({"session_id": session_id, "user_id": user["id"]})
    return {"deleted": res.deleted_count}
