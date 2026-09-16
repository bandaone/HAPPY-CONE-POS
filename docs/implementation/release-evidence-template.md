# Happy Cone release evidence

Copy this file for each release and replace every blank. A release is blocked while any required result is blank or failed without an approved, documented resolution.

## Release record

| Field | Value |
| --- | --- |
| Version / Git tag | |
| Commit | |
| Staging URL | |
| Production URL | |
| Reviewer | |
| Review date | |
| Counter device / browser | |
| Preparation device / browser | |
| Receipt printer / paper width | |

## Automated checks

| Check | Result / evidence |
| --- | --- |
| API suite | |
| Web component suite | |
| Production web build | |
| Playwright full flow and axe scan | |
| PostgreSQL migration on staging copy | |
| Built-container smoke test | |
| Dependency/security scan | |

## Role and workflow review

Record pass/fail and any issue identifier for owner, manager, cashier and server sign-in; business-day open/close; category/product/variation creation; price and recipe edit; catalog archive; cash sale; manually confirmed payment; receipt print/reprint; preparation transitions; refund; inventory movement/count; reports; activity log; staff account creation/deactivation/password reset; own-password change; offline cash order and reconnect sync.

| Workflow / role | Result / evidence |
| --- | --- |
| Owner administration | |
| Manager operations | |
| Catalog, prices and recipes | |
| Cashier counter | |
| Server preparation | |
| Offline and recovery | |

## Accessibility and device review

| Review | Result / evidence |
| --- | --- |
| Keyboard only, visible focus and dialog focus return | |
| Screen reader: sign-in, checkout, errors, preparation, settings | |
| 320 CSS px reflow and 200% zoom | |
| Text, focus and non-text contrast measurements | |
| Reduced motion | |
| Touch targets during observed service trial | |
| Sunlight/glare and preparation-screen distance | |
| 58/80 mm grayscale receipt legibility and no clipped values | |

## Operations gate

| Check | Result / evidence |
| --- | --- |
| TLS certificate and expiry alert | |
| Host firewall and private database/API ports | |
| `/health` and `/ready` monitoring | |
| Central logs and request-ID search | |
| Encrypted off-host backup | |
| Timed staging restore rehearsal | |
| Disk, database, restart and backup alerts | |
| Manual payment reconciliation procedure approved | |
| ZRA/fiscal disposition recorded | |
| Staff fallback and incident briefing completed | |

## Approval

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Business owner | | | |
| Technical operator | | | |
| Stand manager | | | |
