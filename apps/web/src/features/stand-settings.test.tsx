import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { defaultStandProfile } from '../App';
import type { POSClient, StandProfile, User } from '../lib/types';
import { StandSettingsCards } from './StandSettings';

const manager: User = { id: 'manager', username: 'manager', name: 'Mwamba Banda', role: 'MANAGER', active: true };

it('lets a manager edit stand identity and saves the complete profile', async () => {
  const updateStandSettings = vi.fn(async (profile: StandProfile) => profile);
  const onSaved = vi.fn();
  render(<StandSettingsCards profile={defaultStandProfile} user={manager} client={{ updateStandSettings } as unknown as POSClient} onSaved={onSaved} onAudit={()=>{}} onHelp={()=>{}}/>);
  const user = userEvent.setup();

  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit stand details' });
  const standName = within(dialog).getByLabelText('Stand name');
  await user.clear(standName);
  await user.type(standName, 'Arcades stand');
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

  expect(updateStandSettings).toHaveBeenCalledWith(expect.objectContaining({ stand_name: 'Arcades stand' }));
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ stand_name: 'Arcades stand' }));
});

it('lets a manager maintain the details printed on receipts', async () => {
  const updateStandSettings = vi.fn(async (profile: StandProfile) => profile);
  render(<StandSettingsCards profile={defaultStandProfile} user={manager} client={{ updateStandSettings } as unknown as POSClient} onSaved={()=>{}} onAudit={()=>{}} onHelp={()=>{}}/>);
  const user = userEvent.setup();

  await user.click(screen.getByRole('button', { name: 'Edit receipt details' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit receipt details' });
  await user.clear(within(dialog).getByLabelText('TPIN'));
  await user.type(within(dialog).getByLabelText('TPIN'), '1002003004');
  await user.clear(within(dialog).getByLabelText('Tax rate (%)'));
  await user.type(within(dialog).getByLabelText('Tax rate (%)'), '5');
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

  expect(updateStandSettings).toHaveBeenCalledWith(expect.objectContaining({ tax_id: '1002003004', tax_rate_basis_points: 500 }));
});
