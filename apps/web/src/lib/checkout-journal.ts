import type { CheckoutCommand } from './types';
const key = (workspace: string) => `happy-cone:payment-attempt:v1:${workspace}`;
export function readAttempt(workspace: string): CheckoutCommand | null {
  const raw = localStorage.getItem(key(workspace));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as CheckoutCommand;
    if (!value.idempotency_key || !value.business_day_id || !Array.isArray(value.lines) || !value.payment) throw new Error('Invalid saved payment');
    return value;
  } catch { throw new Error('The saved payment could not be read. Ask a manager to check Sales before changing browser data.'); }
}
export function saveAttempt(workspace: string, command: CheckoutCommand): void {
  const existing = readAttempt(workspace);
  if (existing && JSON.stringify(existing) !== JSON.stringify(command)) throw new Error('Resolve the unresolved payment before taking another payment.');
  try { localStorage.setItem(key(workspace), JSON.stringify(command)); }
  catch { throw new Error('Recovery storage is unavailable. The payment was not sent. Free device storage and try again.'); }
}
export function clearAttempt(workspace: string): void { localStorage.removeItem(key(workspace)); }
