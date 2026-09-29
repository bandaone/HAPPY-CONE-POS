# Xprinter receipt-printer commissioning

The current **HP DesignJet PostScript** selection is not a receipt-printer driver. It can produce unreadable output, uncontrolled paper feeding, or a full roll feed. Do not send another Happy Cone receipt to that queue.

## Record the printer

Write down these values before installing anything:

| Field | Result |
| --- | --- |
| Exact model printed on the label, beginning `XP-` | |
| Serial number | |
| USB, Ethernet, or Bluetooth connection | |
| Paper roll width: 58 mm or 80 mm | |
| Windows edition and 64-bit status | |
| Driver name and version | |
| Test date and operator | |

Use the exact Xprinter model and connection to obtain the matching 64-bit Windows driver from Xprinter or its authorized supplier. A similar model name is insufficient. Remove the incorrect HP DesignJet PostScript queue from **Settings → Bluetooth & devices → Printers & scanners** after confirming no other device needs it.

## Install and set the queue

1. Load the correct thermal roll and run the printer’s hardware self-test. Confirm model, interface, and paper width on the self-test.
2. Install the exact Xprinter driver while signed in as a Windows administrator.
3. Connect the printer as directed by that driver and give the queue a clear name such as `Happy Cone Receipt`.
4. Set the correct 58 mm or 80 mm roll width. Use continuous receipt paper, zero driver margins where supported, 100% scale, and cut or feed after each print job.
5. Disable **Print headers and footers** in the browser print dialog. Do not select **Fit to page**.
6. Print a Windows test page. Stop here if it prints symbols, feeds continuously, or uses more than one normal receipt length.
7. In Happy Cone **Settings → Receipt details**, select the matching paper width.

## Happy Cone print test

Use a training business day and clearly marked test sale. Print and record each case:

- A short receipt with one item.
- A normal receipt with several variations, cash tendered, and change.
- A long receipt with enough items to exceed one screen and an intentionally long product name.
- A saved-sale reprint from **Sales**.
- The Happy Cone logo in clear grayscale.
- Legal name, location, TPIN, phone, and Turnover Tax details below the logo.
- Item names, quantities, values, totals, payment, cashier, and Receipt No. without clipped text.
- No application menu, modal background, browser URL, date header, or page number.
- Correct final feed and one cut or clean tear position; no repeated blank paper.

Run the 58 mm test at no more than 48 mm printable content and the 80 mm test at no more than 72 mm. Keep the working queue name, driver version, width, browser settings, and a photographed short and long receipt in the release evidence.

If continuous feeding or unreadable output returns, cancel the Windows print job, switch off the printer, confirm the job is using the `Happy Cone Receipt` queue, and recheck the exact Xprinter driver. Do not troubleshoot this by changing Happy Cone tax or receipt data.
