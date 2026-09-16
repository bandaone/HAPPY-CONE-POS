import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAttempt, saveAttempt, clearAttempt } from './checkout-journal';
import type { CheckoutCommand } from './types';
const command: CheckoutCommand = { idempotency_key: 'sale-one', business_day_id: 'day-one', lines: [{variant_id:'vanilla-double',quantity:1,modifier_ids:['cone','oreo'],notes:''}], payment:{method:'CASH',tendered_ngwee:5000,provider:null,reference:null},offline:false };
beforeEach(()=>localStorage.clear());
describe('payment recovery journal',()=>{
  it('preserves the exact command through reload and separates staff workspaces',()=>{
    saveAttempt('live:cashier',command);
    expect(readAttempt('live:cashier')).toEqual(command);
    expect(readAttempt('demo:cashier')).toBeNull();
    expect(readAttempt('live:other')).toBeNull();
  });
  it('does not replace an unresolved payment with a new idempotency key',()=>{
    saveAttempt('live:cashier',command);
    expect(()=>saveAttempt('live:cashier',{...command,idempotency_key:'another-sale'})).toThrow(/unresolved/);
    expect(readAttempt('live:cashier')?.idempotency_key).toBe('sale-one');
  });
  it('clears only an acknowledged or definitively rejected payment',()=>{
    saveAttempt('live:cashier',command);clearAttempt('live:cashier');
    expect(readAttempt('live:cashier')).toBeNull();
  });
  it('blocks submission when recovery storage cannot be written',()=>{
    const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Quota exceeded');});
    expect(()=>saveAttempt('live:cashier',command)).toThrow(/not sent/);spy.mockRestore();
  });
});
