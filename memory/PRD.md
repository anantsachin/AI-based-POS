# Restaurant POS — PRD

## Original problem statement
> "create a reastaurent pos system with swiggy and zomato integration with hybrid offline online function"

## Architecture
- **Backend**: FastAPI + Motor (MongoDB), JWT auth (bcrypt), modular routers (`auth.py`, `pos_routes.py`)
- **Frontend**: React 19 + Tailwind + shadcn/ui + Recharts; Bearer-token auth (localStorage), localStorage offline queue
- **DB**: MongoDB (`restaurant_pos`), all entities use uuid `id` (not `_id`)
- **Aggregator**: MOCKED — `/api/aggregator/simulate` generates demo orders, `/api/aggregator/webhook/{source}` accepts normalized payloads (real signature/auth deferred until partner credentials available)

## Personas
- **Admin** — owns menu, staff, settings, reports (full access)
- **Cashier** — POS billing, payments, KOT, reports
- **Waiter** — POS billing, KOT, tables (no admin)

## Core requirements (static)
1. Multi-channel orders: Dine-in / Takeaway / Swiggy / Zomato
2. Menu management with categories, modifiers, availability toggles
3. Table/floor view with status (available/occupied/billing)
4. Kitchen Order Ticket display with stage progression
5. Aggregator order feed with accept/reject + brand color coding
6. Sales reports: revenue trend, channel split, payment split, top items
7. Hybrid offline mode — localStorage queue + bulk sync via `/api/sync`
8. Role-based access (admin/cashier/waiter)

## What's been implemented (2026-02-01)
### Backend (`/app/backend/`)
- `auth.py` — login/logout/me, role-guard `require_roles()`, user CRUD
- `pos_routes.py` — categories, menu-items, tables, orders (+payment, status), aggregator (simulate + webhook), reports/sales, settings, /sync
- `seed.py` — admin/cashier/waiter, 6 categories, 19 menu items, 12 tables, default restaurant settings, writes `/app/memory/test_credentials.md`
- Idempotent offline sync via `client_id`; webhook idempotent via `aggregator_order_id`

### Frontend (`/app/frontend/src/`)
- Pages: Login, Dashboard, POS, Tables, KOT, Aggregators, Menu, Reports, Staff, Settings
- AuthContext with token persistence; Layout with sidebar, online/offline indicator + sync button
- Offline queue (`lib/offline.js`) + auto-sync on reconnect

## Testing
- 26/26 backend pytest passing (`/app/backend/tests/backend_test.py`)
- Frontend smoke test passed across all pages

## Test credentials
See `/app/memory/test_credentials.md`
- admin@pos.com / admin123
- cashier@pos.com / cashier123
- waiter@pos.com / waiter123

## Backlog (P1)
- Replace mocked aggregator with real Swiggy/Zomato Partner API once user provides credentials
- Receipt printing (ESC/POS or PDF) + customer-facing receipt link
- Modifiers/variants on menu items (size, addons)
- Order edit after sending to kitchen
- Multi-outlet support
- Service worker for true PWA offline (currently localStorage queue is sufficient for short outages)

## Backlog (P2)
- Inventory tracking & low-stock alerts
- Customer CRM with order history & loyalty points
- Tip handling and split bills
- Stripe/Razorpay online payment for takeaway pre-orders
- Daily Z-report PDF export
