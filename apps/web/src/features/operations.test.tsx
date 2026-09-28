import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sales } from './Operations';
import type { Order, POSClient } from '../lib/types';

const completedSale: Order = {
  id: 'sale-1',
  number: 'A001',
  business_day_id: 'day-1',
  status: 'SERVED',
  created_at: '2026-09-28T08:00:00Z',
  cashier_name: 'Mwansa Banda',
  lines: [{
    variant_id: 'vanilla-double',
    name: 'Vanilla · Double',
    quantity: 1,
    unit_price_ngwee: 4200,
    total_ngwee: 4200,
    modifier_names: ['Waffle cone'],
    notes: '',
  }],
  total_ngwee: 4200,
  payment: {
    method: 'CASH',
    status: 'CONFIRMED',
    amount_ngwee: 4200,
    tendered_ngwee: 5000,
    change_ngwee: 800,
    provider: null,
    reference: null,
  },
  refunded: false,
  refund_reason: null,
  offline: false,
};

describe('sales history', () => {
  it('presents completed sales by receipt number without preparation statuses', async () => {
    const client = { orders: vi.fn().mockResolvedValue([completedSale]) } as unknown as POSClient;

    render(<Sales client={client} canManage onReceipt={vi.fn()} onChanged={vi.fn()}/>);

    expect(await screen.findByRole('columnheader', { name: 'Receipt No.' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search sales')).toHaveAttribute('placeholder', 'Receipt number or product');
    expect(screen.getByText('Completed', { selector: '.badge' })).toBeInTheDocument();
    const statusFilter = screen.getByLabelText('Filter sales status');
    expect(within(statusFilter).queryByRole('option', { name: /New|Preparing|Ready|Served/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Recent orders|order number/i)).not.toBeInTheDocument();
  });
});
