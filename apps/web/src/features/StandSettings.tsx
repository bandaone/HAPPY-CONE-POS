import { useState, type FormEvent } from 'react';
import { ArrowRight, BookOpen, CircleHelp, IceCreamCone, Pencil, ReceiptText, ShieldCheck } from 'lucide-react';

import { Badge, ErrorMessage, Modal, SubmitButton } from '../components/ui';
import type { POSClient, StandProfile, User } from '../lib/types';

type Section = 'stand' | 'receipt' | 'payments' | 'activity' | 'guide';

export function StandSettingsCards({ profile, user, client, onSaved, onAudit, onHelp }:{
  profile: StandProfile;
  user: User;
  client: POSClient;
  onSaved: (profile: StandProfile) => void;
  onAudit: () => void;
  onHelp: () => void;
}) {
  const [editing, setEditing] = useState<Section | null>(null);
  const [draft, setDraft] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function open(section: Section) { setDraft(profile); setError(''); setEditing(section); }
  function field(name: keyof StandProfile, value: string | number) { setDraft(current => ({ ...current, [name]: value })); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const updated = await client.updateStandSettings(draft); onSaved(updated); setEditing(null); }
    catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }
  const editButton = (section: Section, label: string) => <button className="button settings-edit" type="button" onClick={() => open(section)}><Pencil size={14}/>{label}</button>;

  return <>
    <div className="two-columns settings-grid">
      <section className="panel"><div className="panel-head settings-panel-head"><div><h2>Stand details</h2><IceCreamCone size={19}/></div>{editButton('stand', 'Edit details')}</div><div className="panel-body">
        <div className="key-value"><span>Business</span><strong>{profile.business_name}</strong></div>
        <div className="key-value"><span>Stand</span><strong>{profile.stand_name}</strong></div>
        <div className="key-value"><span>Location</span><strong>{profile.location}</strong></div>
        <div className="key-value"><span>Currency</span><strong>{profile.currency_name} · {profile.currency_code}</strong></div>
        <div className="key-value"><span>Timezone</span><strong>{profile.timezone}</strong></div>
        <div className="key-value"><span>System</span><Badge tone="green">Live counter</Badge></div>
        <div className="key-value"><span>Signed in as</span><strong>{user.name}</strong></div>
      </div></section>
      <section className="panel"><div className="panel-head settings-panel-head"><div><h2>Receipt details</h2><ReceiptText size={19}/></div>{editButton('receipt', 'Edit receipt details')}</div><div className="panel-body">
        <div className="key-value"><span>Legal name</span><strong>{profile.business_name}</strong></div>
        <div className="key-value"><span>TPIN</span><strong>{profile.tax_id}</strong></div>
        <div className="key-value"><span>Contact</span><strong>{profile.contact_number}</strong></div>
        <div className="key-value"><span>Tax treatment</span><strong>{profile.tax_label} · {profile.tax_rate_basis_points / 100}%</strong></div>
        <p className="hint-inline" style={{marginTop:14}}>These details print below the logo on every completed-sale receipt.</p>
      </div></section>
      <section className="panel"><div className="panel-head settings-panel-head"><div><h2>Payments and tickets</h2><ShieldCheck size={19}/></div>{editButton('payments', 'Edit payment wording')}</div><div className="panel-body prose"><h3>Cash, mobile money and card</h3><p>{profile.payment_guidance}</p><h3>Customer tickets</h3><p>{profile.ticket_guidance}</p><h3>Fiscal status</h3><p>Fiscal integration is not configured. Printed customer tickets are operational receipts and are not certified fiscal invoices.</p><small className="managed-note">System status is protected so receipts cannot claim fiscal certification.</small></div></section>
      <section className="panel"><div className="panel-head settings-panel-head"><div><h2>Activity record</h2><BookOpen size={19}/></div>{editButton('activity', 'Edit activity wording')}</div><div className="panel-body"><p className="prose">{profile.activity_guidance}</p><button className="button" style={{marginTop:18}} onClick={onAudit}>View activity log <ArrowRight size={16}/></button></div></section>
      <section className="panel"><div className="panel-head settings-panel-head"><div><h2>Operating guide</h2><CircleHelp size={19}/></div>{editButton('guide', 'Edit guide')}</div><div className="panel-body"><p className="prose">The guide covers the daily workflow, keyboard controls, offline operation and printing.</p><button className="button" style={{marginTop:18}} onClick={onHelp}>Open counter guide <ArrowRight size={16}/></button></div></section>
    </div>
    {editing && <Modal wide title={editing === 'stand' ? 'Edit stand details' : editing === 'receipt' ? 'Edit receipt details' : editing === 'payments' ? 'Edit payment and ticket wording' : editing === 'activity' ? 'Edit activity wording' : 'Edit counter guide'} eyebrow="Stand administration" onClose={() => !busy && setEditing(null)}>
      <form onSubmit={save}><div className="modal-body"><p>Changes apply to this counter and its printed customer tickets.</p>
        {editing === 'stand' && <div className="settings-form-grid">
          <label className="field">Business name<input required maxLength={120} value={draft.business_name} onChange={e=>field('business_name',e.target.value)}/></label>
          <label className="field">Stand name<input required maxLength={120} value={draft.stand_name} onChange={e=>field('stand_name',e.target.value)}/></label>
          <label className="field field-wide">Location<input required maxLength={160} value={draft.location} onChange={e=>field('location',e.target.value)}/></label>
          <label className="field">Currency name<input required maxLength={80} value={draft.currency_name} onChange={e=>field('currency_name',e.target.value)}/></label>
          <label className="field">Currency code<input required minLength={3} maxLength={3} value={draft.currency_code} onChange={e=>field('currency_code',e.target.value.toUpperCase())}/></label>
          <label className="field">Currency symbol<input required maxLength={6} value={draft.currency_symbol} onChange={e=>field('currency_symbol',e.target.value)}/></label>
          <label className="field">Timezone<input required maxLength={80} value={draft.timezone} onChange={e=>field('timezone',e.target.value)} placeholder="Africa/Lusaka"/><small>Use an IANA timezone such as Africa/Lusaka.</small></label>
        </div>}
        {editing === 'receipt' && <div className="settings-form-grid">
          <label className="field field-wide">Legal business name<input required maxLength={120} value={draft.business_name} onChange={e=>field('business_name',e.target.value)}/></label>
          <label className="field">Shop or branch name<input required maxLength={120} value={draft.stand_name} onChange={e=>field('stand_name',e.target.value)}/></label>
          <label className="field">Location<input required maxLength={160} value={draft.location} onChange={e=>field('location',e.target.value)}/></label>
          <label className="field">TPIN<input required minLength={5} maxLength={40} value={draft.tax_id} onChange={e=>field('tax_id',e.target.value)}/></label>
          <label className="field">Contact number<input required minLength={5} maxLength={40} value={draft.contact_number} onChange={e=>field('contact_number',e.target.value)}/></label>
          <label className="field">Tax category<input required maxLength={80} value={draft.tax_label} onChange={e=>field('tax_label',e.target.value)}/></label>
          <label className="field">Tax rate (%)<input aria-label="Tax rate (%)" required type="number" min="0" max="100" step="0.01" value={draft.tax_rate_basis_points / 100} onChange={e=>field('tax_rate_basis_points',Math.round(Number(e.target.value) * 100))}/><small>For TOT, tax is calculated from the gross sale total.</small></label>
          <label className="field field-wide">Receipt footer<input required maxLength={240} value={draft.receipt_footer} onChange={e=>field('receipt_footer',e.target.value)}/></label>
        </div>}
        {editing === 'payments' && <>
          <label className="field">Payment instructions<textarea required minLength={10} maxLength={1000} value={draft.payment_guidance} onChange={e=>field('payment_guidance',e.target.value)}/></label>
          <label className="field">Customer ticket instructions<textarea required minLength={10} maxLength={1000} value={draft.ticket_guidance} onChange={e=>field('ticket_guidance',e.target.value)}/></label>
        </>}
        {editing === 'activity' && <label className="field">Activity record introduction<textarea required minLength={10} maxLength={1000} value={draft.activity_guidance} onChange={e=>field('activity_guidance',e.target.value)}/></label>}
        {editing === 'guide' && <>
          <label className="field">From order to served<textarea required minLength={10} maxLength={1500} value={draft.guide_workflow} onChange={e=>field('guide_workflow',e.target.value)}/></label>
          <label className="field">Keyboard and touch<textarea required minLength={10} maxLength={1500} value={draft.guide_controls} onChange={e=>field('guide_controls',e.target.value)}/></label>
          <label className="field">When the connection drops<textarea required minLength={10} maxLength={1500} value={draft.guide_offline} onChange={e=>field('guide_offline',e.target.value)}/></label>
          <label className="field">Printing and accessibility<textarea required minLength={10} maxLength={1500} value={draft.guide_printing} onChange={e=>field('guide_printing',e.target.value)}/></label>
        </>}
        <ErrorMessage error={error}/>
      </div><div className="modal-footer"><button className="button" type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button><SubmitButton busy={busy}>Save changes</SubmitButton></div></form>
    </Modal>}
  </>;
}
