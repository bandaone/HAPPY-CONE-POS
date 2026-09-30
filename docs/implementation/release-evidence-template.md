# Happy Cone release evidence

Copy this file for each release and fill every required result. Any blank or failed release gate blocks real sales until it has a documented resolution.

## Release record

| Field | Value |
| --- | --- |
| Version / Git tag | |
| Commit | |
| Release-folder SHA-256 manifest verified | |
| Windows computer model / RAM / storage | |
| Windows version / build | |
| Reserved LAN address | |
| Reviewer and date | |
| Exact Xprinter model / driver / paper width | |

## Automated checks

| Check | Result / evidence |
| --- | --- |
| API suite | |
| Web component suite and production build | |
| Playwright full flow, accessibility scan and receipt overflow | |
| Bundle-builder tests and full release manifest verification | |
| PowerShell parser and all Pester tests on Windows | |
| Clean offline wheelhouse install, timezone import and migration `0009` | |
| Container checks for the managed-Linux alternative | |

## Windows computer gate

| Check | Result / evidence |
| --- | --- |
| Preflight passed: 64-bit, supported Windows, at least 4 GB RAM and 10 GB free | |
| Clean offline install completed without downloading | |
| PostgreSQL and API listen on loopback; firewall rule is Private profile only | |
| Restart recovery: all three services and `/health` + `/ready` pass | |
| Another LAN device works while internet is disconnected | |
| Idle and checkout memory use recorded | |
| Daily local backup created, validated and retention confirmed | |
| Encrypted USB export checksum passed; recovery identity stored separately | |
| Separate-database restore rehearsal passed and elapsed time recorded | |
| Support bundle checked: redacted config and bounded logs, no database/backups | |

## Role and business-flow review

| Workflow / role | Result / evidence |
| --- | --- |
| Owner sign-in, staff accounts, settings and receipt details | |
| Manager menu, descriptions, prices, choices and availability | |
| Cashier open day, fast checkout, receipt, reprint and close day | |
| Cash, Mobile money and Card method recording and reconciliation | |
| Existing inventory history retained without checkout stock changes | |
| Refund, reports and activity record | |
| Offline cash sale and reconnect sync | |
| Archived price edit and restoration | |

## Accessibility and device review

| Review | Result / evidence |
| --- | --- |
| Keyboard only, visible focus and dialog focus return | |
| Screen reader: sign-in, checkout, errors, Menu and settings | |
| 320 CSS px reflow and 200% zoom | |
| Text, focus and non-text contrast measurements | |
| Reduced motion | |
| Touch targets with wet or gloved hands during observed counter trial | |
| Sunlight/glare at the real counter | |

## Xprinter gate

| Check | Result / evidence |
| --- | --- |
| HP DesignJet PostScript queue is not used | |
| Exact XP model and matching 64-bit Xprinter driver recorded | |
| Hardware self-test and Windows test page pass | |
| Short, normal and long Happy Cone receipts pass | |
| Logo, location, TPIN and contact number are clear | |
| Long names wrap; values and totals do not clip | |
| No browser header/footer or application interface prints | |
| Final feed and single cut/tear are correct; no continuous blank feed | |
| Saved-sale reprint passes | |

## Business and compliance gate

| Check | Result / evidence |
| --- | --- |
| Receipt legal name, location, TPIN, phone, TOT rate and wording approved | |
| Receipt is not represented as ZRA Smart Invoice or fiscal certification | |
| Manual external-payment and refund procedures approved | |
| Named staff briefed; shared accounts prohibited | |
| Power-cut, printer-failure and network-failure fallback rehearsed | |
| No router port forwarding; any later remote access separately reviewed | |

## Approval

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Business owner | | | |
| Technical operator | | | |
| Stand manager | | | |
