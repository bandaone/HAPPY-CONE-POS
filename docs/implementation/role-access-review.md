# Happy Cone role access review

Verified against the local application on 15 September 2026.

## Local accounts

All demonstration accounts use the password `happycone-local-2026`.

| Role | Username | Landing page | Visible navigation |
| --- | --- | --- | --- |
| Owner admin | `owner` | Counter | Counter, Prepare, Sales, Stock, Cash day, Reports, Settings, Help |
| Manager | `manager` | Counter | Counter, Prepare, Sales, Stock, Cash day, Reports, Settings, Help |
| Cashier | `cashier` | Counter | Counter, Sales, Cash day, Help |
| Server | `server` | Preparation queue | Prepare, Help |

Owner and manager currently share the complete MVP workspace. Cashiers operate the counter, sales history, and cash day. Servers receive the focused preparation queue and do not receive financial or management navigation.

## Captured views

- [Owner workspace](role-views/owner.png)
- [Manager workspace](role-views/manager.png)
- [Cashier workspace](role-views/cashier.png)
- [Server workspace](role-views/server.png)

Each login returned HTTP 200, loaded the Happy Cone logo, displayed the expected staff identity and role, and produced no browser console errors during this review.
