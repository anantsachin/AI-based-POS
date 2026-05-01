"""Restaurant POS backend tests.

Covers: auth, RBAC, menu/tables/orders CRUD, aggregator simulate+webhook,
offline sync, reports, users, settings.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # fallback to local frontend .env (dev)
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().strip('"')
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@pos.com", "password": "admin123"}
CASHIER = {"email": "cashier@pos.com", "password": "cashier123"}
WAITER = {"email": "waiter@pos.com", "password": "waiter123"}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _login(s, creds):
    r = s.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    return tok, r.json()["user"]


@pytest.fixture(scope="session")
def admin_tok(s):
    tok, _ = _login(s, ADMIN)
    return tok


@pytest.fixture(scope="session")
def waiter_tok(s):
    tok, _ = _login(s, WAITER)
    return tok


@pytest.fixture(scope="session")
def cashier_tok(s):
    tok, _ = _login(s, CASHIER)
    return tok


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- auth ----------
class TestAuth:
    def test_health(self, s):
        r = s.get(f"{API}/health", timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_login_bad(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "admin@pos.com", "password": "wrong"})
        assert r.status_code == 401

    def test_login_all_roles(self, s):
        for c in [ADMIN, CASHIER, WAITER]:
            tok, u = _login(s, c)
            assert tok and u["email"] == c["email"]

    def test_me(self, s, admin_tok):
        r = s.get(f"{API}/auth/me", headers=H(admin_tok))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_no_token(self, s):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------- base data ----------
class TestBaseData:
    def test_categories_requires_auth(self, s):
        r = requests.get(f"{API}/categories")
        assert r.status_code == 401

    def test_categories(self, s, admin_tok):
        r = s.get(f"{API}/categories", headers=H(admin_tok))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        assert "id" in data[0] and "name" in data[0]

    def test_menu_items(self, s, admin_tok):
        r = s.get(f"{API}/menu-items", headers=H(admin_tok))
        assert r.status_code == 200
        assert len(r.json()) >= 10

    def test_tables(self, s, admin_tok):
        r = s.get(f"{API}/tables", headers=H(admin_tok))
        assert r.status_code == 200
        tables = r.json()
        assert len(tables) >= 12
        assert all("status" in t for t in tables)


# ---------- RBAC menu ----------
class TestMenuRBAC:
    def test_admin_create_item(self, s, admin_tok):
        cats = s.get(f"{API}/categories", headers=H(admin_tok)).json()
        cat_id = cats[0]["id"]
        payload = {"name": "TEST_ItemAdmin", "category_id": cat_id, "price": 99.5,
                   "image_url": "", "available": True, "tax_rate": 5.0}
        r = s.post(f"{API}/menu-items", headers=H(admin_tok), json=payload)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["name"] == "TEST_ItemAdmin"
        # cleanup
        s.delete(f"{API}/menu-items/{item['id']}", headers=H(admin_tok))

    def test_waiter_create_item_forbidden(self, s, waiter_tok, admin_tok):
        cats = s.get(f"{API}/categories", headers=H(admin_tok)).json()
        r = s.post(f"{API}/menu-items", headers=H(waiter_tok),
                   json={"name": "TEST_waiter", "category_id": cats[0]["id"], "price": 10})
        assert r.status_code == 403


# ---------- Orders ----------
class TestOrderFlow:
    def test_dine_in_flow(self, s, admin_tok):
        tables = s.get(f"{API}/tables", headers=H(admin_tok)).json()
        available = [t for t in tables if t["status"] == "available"]
        assert available, "no available table"
        table = available[0]
        items = s.get(f"{API}/menu-items", headers=H(admin_tok)).json()
        oi = items[0]
        payload = {
            "channel": "dine-in",
            "table_id": table["id"],
            "customer_name": "TEST_Dine",
            "items": [{"menu_item_id": oi["id"], "name": oi["name"],
                       "price": oi["price"], "quantity": 2, "notes": ""}],
        }
        r = s.post(f"{API}/orders", headers=H(admin_tok), json=payload)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["status"] == "new"
        assert order["total"] > 0

        # table flipped to occupied
        tt = s.get(f"{API}/tables", headers=H(admin_tok)).json()
        tb = [t for t in tt if t["id"] == table["id"]][0]
        assert tb["status"] == "occupied"
        assert tb["current_order_id"] == order["id"]

        # statuses progression
        for st in ["preparing", "ready", "served"]:
            r = s.put(f"{API}/orders/{order['id']}/status",
                      headers=H(admin_tok), json={"status": st})
            assert r.status_code == 200
            assert r.json()["status"] == st

        # Payment completes + frees table
        r = s.post(f"{API}/orders/{order['id']}/payment",
                   headers=H(admin_tok),
                   json={"payment_method": "cash", "amount_paid": order["total"]})
        assert r.status_code == 200

        got = s.get(f"{API}/orders/{order['id']}", headers=H(admin_tok)).json()
        assert got["status"] == "completed"
        assert got["payment_status"] == "paid"

        tt2 = s.get(f"{API}/tables", headers=H(admin_tok)).json()
        tb2 = [t for t in tt2 if t["id"] == table["id"]][0]
        assert tb2["status"] == "available"
        assert tb2["current_order_id"] is None

    def test_status_cancelled_frees_table(self, s, admin_tok):
        tables = s.get(f"{API}/tables", headers=H(admin_tok)).json()
        available = [t for t in tables if t["status"] == "available"]
        items = s.get(f"{API}/menu-items", headers=H(admin_tok)).json()
        oi = items[0]
        r = s.post(f"{API}/orders", headers=H(admin_tok), json={
            "channel": "dine-in", "table_id": available[0]["id"],
            "items": [{"menu_item_id": oi["id"], "name": oi["name"],
                       "price": oi["price"], "quantity": 1}],
        })
        order = r.json()
        s.put(f"{API}/orders/{order['id']}/status", headers=H(admin_tok),
              json={"status": "cancelled"})
        tt = s.get(f"{API}/tables", headers=H(admin_tok)).json()
        tb = [t for t in tt if t["id"] == available[0]["id"]][0]
        assert tb["status"] == "available"

    def test_order_invalid_status(self, s, admin_tok):
        r = s.put(f"{API}/orders/does-not-exist/status",
                  headers=H(admin_tok), json={"status": "foo"})
        assert r.status_code == 400


# ---------- Aggregator ----------
class TestAggregator:
    def test_simulate_swiggy(self, s, admin_tok):
        r = s.post(f"{API}/aggregator/simulate?source=swiggy", headers=H(admin_tok))
        assert r.status_code == 200
        o = r.json()
        assert o["channel"] == "swiggy"
        assert o["aggregator_order_id"].startswith("SWIGGY-")

    def test_simulate_zomato(self, s, admin_tok):
        r = s.post(f"{API}/aggregator/simulate?source=zomato", headers=H(admin_tok))
        assert r.status_code == 200
        o = r.json()
        assert o["channel"] == "zomato"
        assert o["aggregator_order_id"].startswith("ZOMATO-")

    def test_webhook_swiggy_and_idempotent(self, s, admin_tok):
        items = s.get(f"{API}/menu-items", headers=H(admin_tok)).json()
        oi = items[0]
        agg_id = f"SWIGGY-{uuid.uuid4().hex[:8]}"
        payload = {
            "aggregator_order_id": agg_id,
            "customer_name": "Hook Cust",
            "customer_phone": "+91 999",
            "items": [{"menu_item_id": oi["id"], "name": oi["name"],
                       "price": oi["price"], "quantity": 1}],
        }
        r = s.post(f"{API}/aggregator/webhook/swiggy", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        # duplicate call
        r2 = s.post(f"{API}/aggregator/webhook/swiggy", json=payload)
        assert r2.status_code == 200
        assert r2.json().get("duplicate") is True

    def test_webhook_invalid_source(self, s):
        r = s.post(f"{API}/aggregator/webhook/uber", json={"items": []})
        assert r.status_code == 400


# ---------- Offline sync ----------
class TestSync:
    def test_sync_multiple_with_dedup(self, s, admin_tok):
        items = s.get(f"{API}/menu-items", headers=H(admin_tok)).json()
        oi = items[0]
        cid1 = f"TEST_cli_{uuid.uuid4().hex[:8]}"
        cid2 = f"TEST_cli_{uuid.uuid4().hex[:8]}"
        body = {"orders": [
            {"channel": "takeaway", "client_id": cid1,
             "items": [{"menu_item_id": oi["id"], "name": oi["name"],
                        "price": oi["price"], "quantity": 1}]},
            {"channel": "takeaway", "client_id": cid2,
             "items": [{"menu_item_id": oi["id"], "name": oi["name"],
                        "price": oi["price"], "quantity": 2}]},
        ]}
        r = s.post(f"{API}/sync", headers=H(admin_tok), json=body)
        assert r.status_code == 200
        data = r.json()
        assert len(data["created"]) == 2

        # resubmit -> all skipped
        r2 = s.post(f"{API}/sync", headers=H(admin_tok), json=body)
        assert r2.status_code == 200
        assert len(r2.json()["skipped"]) == 2
        assert len(r2.json()["created"]) == 0


# ---------- Reports ----------
class TestReports:
    def test_sales_report(self, s, admin_tok):
        r = s.get(f"{API}/reports/sales?days=7", headers=H(admin_tok))
        assert r.status_code == 200
        d = r.json()
        for k in ["total_revenue", "total_orders", "channel_split",
                  "payment_split", "top_items", "trend"]:
            assert k in d


# ---------- Users admin ----------
class TestUsers:
    def test_list_users_admin(self, s, admin_tok):
        r = s.get(f"{API}/users", headers=H(admin_tok))
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_list_users_waiter_403(self, s, waiter_tok):
        r = s.get(f"{API}/users", headers=H(waiter_tok))
        assert r.status_code == 403

    def test_create_and_cannot_delete_self(self, s, admin_tok):
        # create
        email = f"TEST_user_{uuid.uuid4().hex[:6]}@pos.com"
        r = s.post(f"{API}/users", headers=H(admin_tok),
                   json={"email": email, "password": "pw12345",
                         "name": "TEST U", "role": "waiter"})
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        # login-and-delete-self scenario: fetch admin me id, try delete
        me = s.get(f"{API}/auth/me", headers=H(admin_tok)).json()
        r2 = s.delete(f"{API}/users/{me['id']}", headers=H(admin_tok))
        assert r2.status_code == 400
        # cleanup
        s.delete(f"{API}/users/{uid}", headers=H(admin_tok))


# ---------- Settings ----------
class TestSettings:
    def test_get_settings(self, s, admin_tok):
        r = s.get(f"{API}/settings", headers=H(admin_tok))
        assert r.status_code == 200
        assert r.json()["currency"] in ("INR", "USD", "EUR") or r.json().get("currency")

    def test_update_settings(self, s, admin_tok):
        cur = s.get(f"{API}/settings", headers=H(admin_tok)).json()
        payload = {
            "restaurant_name": cur["restaurant_name"],
            "address": cur["address"], "phone": cur["phone"],
            "tax_rate": 6.0, "service_charge": 2.5,
            "currency": cur["currency"], "currency_symbol": cur["currency_symbol"],
        }
        r = s.put(f"{API}/settings", headers=H(admin_tok), json=payload)
        assert r.status_code == 200
        assert r.json()["tax_rate"] == 6.0
        # reset
        payload["tax_rate"] = cur["tax_rate"]
        payload["service_charge"] = cur["service_charge"]
        s.put(f"{API}/settings", headers=H(admin_tok), json=payload)

    def test_update_settings_waiter_403(self, s, waiter_tok):
        r = s.put(f"{API}/settings", headers=H(waiter_tok),
                  json={"restaurant_name": "x", "address": "x", "phone": "x",
                        "tax_rate": 5, "service_charge": 0,
                        "currency": "INR", "currency_symbol": "₹"})
        assert r.status_code == 403
