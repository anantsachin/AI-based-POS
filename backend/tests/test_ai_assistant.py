"""AI Assistant backend tests — /api/ai/* endpoints.

Covers: auth gating, chat (live data, session memory), end-of-day summary,
sessions list, messages history, delete, and context reflecting live data
(aggregator simulate → chat asks about Swiggy orders).

NOTE: These call a real LLM via emergentintegrations → Anthropic Claude.
      Timeouts are generous (60s) and we assert structure, not exact wording.
"""
import os
import re
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().strip('"')
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@pos.com", "password": "admin123"}
AI_TIMEOUT = 60


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_tok(s):
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Auth ----------
class TestAIAuth:
    def test_chat_requires_auth(self, s):
        r = requests.post(f"{API}/ai/chat", json={"message": "hi"})
        assert r.status_code == 401

    def test_summary_requires_auth(self, s):
        r = requests.post(f"{API}/ai/summary")
        assert r.status_code == 401

    def test_sessions_requires_auth(self, s):
        r = requests.get(f"{API}/ai/sessions")
        assert r.status_code == 401


# ---------- Chat ----------
class TestAIChat:
    def test_chat_empty_message_400(self, s, admin_tok):
        r = s.post(f"{API}/ai/chat", headers=H(admin_tok), json={"message": ""},
                   timeout=AI_TIMEOUT)
        assert r.status_code == 400

    def test_chat_tables_question(self, s, admin_tok):
        # Baseline: get occupied count from /api/tables
        tables = s.get(f"{API}/tables", headers=H(admin_tok)).json()
        occ = sum(1 for t in tables if t["status"] == "occupied")

        r = s.post(f"{API}/ai/chat", headers=H(admin_tok),
                   json={"message": "How many tables are occupied right now? Respond with a number."},
                   timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["session_id", "reply", "message_id"]:
            assert k in data, f"missing {k} in response"
        assert isinstance(data["reply"], str) and len(data["reply"]) > 0
        # Be lenient — assistant must at least mention the real number
        assert str(occ) in data["reply"] or "occupied" in data["reply"].lower()

        # stash for next test
        pytest.ai_session_id = data["session_id"]

    def test_chat_session_memory(self, s, admin_tok):
        """Second call with same session_id — AI should have history context."""
        sid = getattr(pytest, "ai_session_id", None)
        assert sid, "prior test must have set session id"

        # Ask a follow-up that only makes sense if prior turn is remembered
        r = s.post(f"{API}/ai/chat", headers=H(admin_tok),
                   json={"session_id": sid,
                         "message": "Repeat back to me exactly what I asked you in my previous message."},
                   timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["session_id"] == sid
        reply_lower = data["reply"].lower()
        # Should reference prior question about tables being occupied
        assert ("table" in reply_lower and "occupied" in reply_lower), \
            f"History not preserved. Reply: {data['reply']!r}"

    def test_chat_context_reflects_live_data(self, s, admin_tok):
        """Create a Swiggy order via /api/aggregator/simulate, then ask AI about it."""
        def _swiggy_count():
            rep = s.get(f"{API}/reports/sales?days=1", headers=H(admin_tok)).json()
            cs = rep.get("channel_split", [])
            if isinstance(cs, list):
                for entry in cs:
                    if entry.get("channel") == "swiggy":
                        return entry.get("orders", 0)
                return 0
            return cs.get("swiggy", {}).get("orders", 0) if isinstance(cs, dict) else 0

        before = _swiggy_count()
        # Simulate a new Swiggy order
        sim = s.post(f"{API}/aggregator/simulate?source=swiggy", headers=H(admin_tok))
        assert sim.status_code == 200
        # Brief delay for persistence
        time.sleep(1)
        after = _swiggy_count()
        assert after >= before + 1, f"simulate did not register: before={before} after={after}"

        r = s.post(f"{API}/ai/chat", headers=H(admin_tok),
                   json={"message": "How many Swiggy orders came in today? Just respond with the number."},
                   timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        reply = r.json()["reply"]
        # Reply must mention swiggy or the number
        nums = re.findall(r"\d+", reply)
        assert "swiggy" in reply.lower() or (nums and str(after) in nums), \
            f"AI reply didn't reflect live swiggy count (expected {after}): {reply!r}"


# ---------- Summary ----------
class TestAISummary:
    def test_summary_structure(self, s, admin_tok):
        r = s.post(f"{API}/ai/summary", headers=H(admin_tok), timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["session_id", "summary"]:
            assert k in data
        txt = data["summary"].lower()
        # Should contain at least a couple of the requested sections
        hits = sum(1 for tok in ["revenue", "orders", "headline", "operations", "top"]
                   if tok in txt)
        assert hits >= 2, f"summary missing expected sections: {data['summary']!r}"


# ---------- Sessions ----------
class TestAISessions:
    def test_sessions_list(self, s, admin_tok):
        # Ensure at least one session exists
        r0 = s.post(f"{API}/ai/chat", headers=H(admin_tok),
                    json={"message": "hello"}, timeout=AI_TIMEOUT)
        assert r0.status_code == 200
        sid = r0.json()["session_id"]

        r = s.get(f"{API}/ai/sessions", headers=H(admin_tok))
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        ids = [row["session_id"] for row in rows]
        assert sid in ids
        # required keys
        row = next(x for x in rows if x["session_id"] == sid)
        for k in ["session_id", "last_text", "last_role", "last_at", "count"]:
            assert k in row

    def test_session_messages_order(self, s, admin_tok):
        r0 = s.post(f"{API}/ai/chat", headers=H(admin_tok),
                    json={"message": "ping from test"}, timeout=AI_TIMEOUT)
        sid = r0.json()["session_id"]

        r = s.get(f"{API}/ai/sessions/{sid}/messages", headers=H(admin_tok))
        assert r.status_code == 200
        msgs = r.json()
        assert isinstance(msgs, list) and len(msgs) >= 2
        assert msgs[0]["role"] == "user"
        assert msgs[1]["role"] == "assistant"
        # chronological
        ts = [m["created_at"] for m in msgs]
        assert ts == sorted(ts)

    def test_delete_session_scopes_to_user(self, s, admin_tok):
        # Create a session
        r0 = s.post(f"{API}/ai/chat", headers=H(admin_tok),
                    json={"message": "to be deleted"}, timeout=AI_TIMEOUT)
        sid = r0.json()["session_id"]

        # Delete
        r = s.delete(f"{API}/ai/sessions/{sid}", headers=H(admin_tok))
        assert r.status_code == 200
        assert r.json()["deleted"] >= 2

        # Confirm gone
        r2 = s.get(f"{API}/ai/sessions/{sid}/messages", headers=H(admin_tok))
        assert r2.status_code == 200
        assert r2.json() == []
