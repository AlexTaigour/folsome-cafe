---
name: in-cafe-order-lock
description: In-café ordering lock (public-IP allowlist) — how it works + manual setup steps
metadata:
  type: project
---

Added 2026-07-22: customer ordering can be restricted to people physically in the café, because the app is served from a public cloud URL and `POST /api/orders` was fully open.

**Mechanism:** allowlist of the café's public IP(s) in `app_settings` key `order_gate` (`{enabled, ips}`). `server/orderGate.js` middleware runs after `optionalAuth` on `POST /api/orders` — logged-in staff bypass; anonymous customers must match. IPv4 exact, IPv6 `/64` prefix. **Fails open** (DB error → order allowed). Owner UI: /owner/ordering (OrderGateTab).

**Two manual steps to actually turn it on:**
1. Re-run `supabase-schema.sql` in Supabase SQL Editor once (adds `app_settings`, idempotent).
2. Set `TRUST_PROXY=1` on the cloud host (Render/Railway) so `req.ip` is the real client, not the load balancer. Without this the gate reads one shared proxy IP and is useless.
3. Owner opens /owner/ordering **while on café Wi-Fi** and taps "Lock ordering to this network".

**Caveat:** if the café ISP hands out a dynamic public IP that changes, ordering breaks until re-locked. Supports multiple IPs (Wi-Fi + 4G backup). See [[use-codebase-md]] for repo conventions.
