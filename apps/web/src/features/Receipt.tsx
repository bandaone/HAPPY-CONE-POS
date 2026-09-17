import { CheckCircle2, Printer } from "lucide-react";

import { BrandLogo, Modal, dateOf, timeOf } from "../components/ui";
import { money } from "../lib/client";
import type { Order, StandProfile } from "../lib/types";

const receiptDefaults = { business_name: "CREAMY HEAVEN LIMITED", stand_name: "Lusaka stand", location: "Lusaka", tax_id: "1002681530", contact_number: "0771450074", tax_label: "STANDARD RATED (A)", tax_rate_basis_points: 1600, receipt_footer: "Thank you for choosing Happy Cone." };

function rateLabel(basisPoints: number) {
  return `${Number.isInteger(basisPoints / 100) ? basisPoints / 100 : (basisPoints / 100).toFixed(2)}%`;
}

function ReceiptRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`receipt-value-row ${strong ? "receipt-value-strong" : ""}`}><dt>{label}</dt><dd>{value}</dd></div>;
}

export function Receipt({ order, profile }: { order: Order; profile?: StandProfile }) {
  const identity = profile ?? receiptDefaults;
  const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const saleReference = order.id.slice(0, 8).toUpperCase();
  const taxNgwee = Math.round(order.total_ngwee * identity.tax_rate_basis_points / (10_000 + identity.tax_rate_basis_points));
  const taxableNgwee = order.total_ngwee - taxNgwee;
  const taxRate = rateLabel(identity.tax_rate_basis_points);
  return <article className="receipt" aria-label={`Receipt for order ${order.number}`}>
    <header className="receipt-header">
      <BrandLogo variant="receipt"/>
      <strong className="receipt-business-name">{identity.business_name}</strong>
      <p>{identity.stand_name}</p>
      <p>{identity.location}</p>
      <p>TPIN: {identity.tax_id}</p>
      <p>Tel: {identity.contact_number}</p>
    </header>
    <dl className="receipt-details">
      <ReceiptRow label="Date" value={dateOf(order.created_at)}/>
      <ReceiptRow label="Time" value={timeOf(order.created_at)}/>
      <ReceiptRow label="Order" value={`Order ${order.number}`}/>
      <ReceiptRow label="Sale reference" value={saleReference}/>
    </dl>
    {order.refunded && <section className="receipt-refund" aria-label="Refund details"><strong>Refunded</strong><span>{order.refund_reason}</span></section>}
    <section className="receipt-lines" aria-label="Items bought">
      {order.lines.map((line, index) => <div className="receipt-line-block" key={`${line.variant_id}-${index}`}>
        <div className="receipt-item-head"><strong>{line.name}</strong></div>
        <div className="receipt-item-code">{line.variant_id.toUpperCase()}</div>
        <div className="receipt-item-price"><span>{line.quantity} × {money(line.unit_price_ngwee)}</span><span>{money(line.total_ngwee)}</span></div>
        {line.modifier_names.length > 0 && <p>{line.modifier_names.join(" · ")}</p>}
        {line.notes && <p>Note: {line.notes}</p>}
      </div>)}
    </section>
    <dl className="receipt-totals">
      <ReceiptRow label="Sale total" value={money(order.total_ngwee)} strong/>
      <ReceiptRow label="Payment" value={order.payment.method === "CASH" ? "Cash" : order.payment.method === "CARD_MANUAL" ? "Card" : "Mobile money"}/>
      {order.payment.method === "CASH" ? <>
        <ReceiptRow label="Cash received" value={money(order.payment.tendered_ngwee ?? order.payment.amount_ngwee)}/>
        <ReceiptRow label="Change" value={money(order.payment.change_ngwee ?? 0)}/>
      </> : <>
        {order.payment.provider && <ReceiptRow label="Provider" value={order.payment.provider}/>}
        {order.payment.reference && <ReceiptRow label="Payment reference" value={order.payment.reference}/>}
      </>}
    </dl>
    <dl className="receipt-details receipt-service-details">
      <ReceiptRow label="Cashier" value={order.cashier_name}/>
      <ReceiptRow label="Units bought" value={`${units} ${units === 1 ? "unit" : "units"}`}/>
    </dl>
    <section className="receipt-tax" aria-labelledby="receipt-tax-title">
      <h2 id="receipt-tax-title">Tax details</h2>
      <p>{identity.tax_label} · {taxRate}</p>
      <dl><ReceiptRow label="Taxable sales" value={money(taxableNgwee)}/><ReceiptRow label={`VAT (${taxRate})`} value={money(taxNgwee)}/></dl>
    </section>
    <footer className="receipt-footer">
      <strong>{identity.receipt_footer}</strong>
    </footer>
  </article>;
}

export function ReceiptModal({ order, profile, onClose, onPrint }: { order: Order; profile?: StandProfile; onClose: () => void; onPrint: () => void }) {
  return <Modal title={`Receipt ${order.number}`} eyebrow={order.refunded ? "Refunded sale" : "Sale saved"} onClose={onClose}>
    <Receipt order={order} profile={profile}/>
    <div className="modal-footer"><button className="button" type="button" onClick={onPrint}><Printer size={16}/>Print receipt</button><button className="button primary" type="button" onClick={onClose}><CheckCircle2 size={16}/>Done</button></div>
  </Modal>;
}
