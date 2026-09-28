# Happy Cone role access review

Verified against the cashier-only application on 28 September 2026.

## Demonstration accounts

The development seed creates Manager, Cashier, and Owner administrator accounts. The seed password is supplied by the operator and is never fixed in source.

| Role | Username | Landing page | Visible navigation |
| --- | --- | --- | --- |
| Owner administrator | `owner` | Counter | Counter, Sales, Stock, Cash day, Reports, Settings, Help |
| Manager | `manager` | Counter | Counter, Sales, Stock, Cash day, Reports, Settings, Help |
| Cashier | `cashier` | Counter | Counter, Sales, Cash day, Help |

Owner administrators and Managers maintain the menu, prices, stock recipes, inventory, refunds, cash close, reports, and stand settings. Cashiers operate the counter, receipt history, and business-day opening/cash view within the API’s role checks.

Historic database rows with the retired `SERVER` role remain visible in **Settings → Staff accounts**. An Owner administrator must reassign or deactivate them. A signed-in historic account receives only the reassignment explanation, account details, and Sign out; it has no operational navigation.

Automated component and browser checks confirm that supported roles have no Prepare navigation or preparation tour step, new accounts cannot be assigned Server, and a historic Server account cannot enter the counter workspace.
