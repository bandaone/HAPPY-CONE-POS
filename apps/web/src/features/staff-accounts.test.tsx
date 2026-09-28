import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { POSClient, User } from '../lib/types';
import { AccountPassword, StaffAccounts } from './Operations';

const owner: User = { id: 'owner-1', username: 'owner', name: 'Dennis', role: 'OWNER_ADMIN', active: true };
const cashier: User = { id: 'cashier-1', username: 'cashier', name: 'Chipo Phiri', role: 'CASHIER', active: true };

test('owner can review and create a staff account', async () => {
  const createUser = vi.fn(async (input) => ({ id: 'cashier-2', active: true, ...input }));
  const users = vi.fn()
    .mockResolvedValueOnce([owner, cashier])
    .mockResolvedValueOnce([owner, cashier, { id: 'cashier-2', username: 'counter-two', name: 'Counter Two', role: 'CASHIER', active: true }]);
  const client = {
    users,
    createUser,
    updateUser: vi.fn(),
    resetUserPassword: vi.fn(),
    revokeUserSessions: vi.fn(),
  } as unknown as POSClient;

  render(<StaffAccounts client={client} currentUserId={owner.id} onError={vi.fn()}/>);
  expect(await screen.findByText('Chipo Phiri')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Add staff account' }));
  const role = screen.getByLabelText('Role');
  expect(role).toHaveTextContent('Cashier');
  expect(role).toHaveTextContent('Manager');
  expect(role).toHaveTextContent('Owner administrator');
  expect(role).not.toHaveTextContent('Server');
  await userEvent.type(screen.getByLabelText('Full name'), 'Counter Two');
  await userEvent.type(screen.getByLabelText('Username'), 'counter-two');
  await userEvent.type(screen.getByLabelText('Temporary password'), 'temporary-password-2026');
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

  await waitFor(() => expect(createUser).toHaveBeenCalledWith({
    name: 'Counter Two',
    username: 'counter-two',
    role: 'CASHIER',
    password: 'temporary-password-2026',
  }));
  expect(await screen.findByText('Counter Two')).toBeInTheDocument();
});

test('owner must reassign a legacy server before reactivating the account', async () => {
  const legacy: User = { id: 'server-1', username: 'server', name: 'Tendai Zulu', role: 'SERVER', active: false };
  const reassigned = { ...legacy, role: 'CASHIER' as const, active: true };
  const updateUser = vi.fn(async () => reassigned);
  const client = {
    users: vi.fn().mockResolvedValueOnce([owner, legacy]).mockResolvedValueOnce([owner, reassigned]),
    createUser: vi.fn(),
    updateUser,
    resetUserPassword: vi.fn(),
    revokeUserSessions: vi.fn(),
  } as unknown as POSClient;

  render(<StaffAccounts client={client} currentUserId={owner.id} onError={vi.fn()}/>);
  expect(await screen.findByText('Legacy server')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Edit Tendai Zulu' }));

  const role = screen.getByLabelText('Role');
  expect(role).toHaveValue('SERVER');
  expect(screen.getByRole('option', { name: 'Legacy server — reassign required' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Account active' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save account changes' })).toBeDisabled();

  await userEvent.selectOptions(role, 'CASHIER');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Account active' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save account changes' }));

  await waitFor(() => expect(updateUser).toHaveBeenCalledWith(legacy.id, {
    name: 'Tendai Zulu', role: 'CASHIER', active: true,
  }));
});

test('owner can deactivate another staff account with explicit confirmation', async () => {
  const updateUser = vi.fn(async () => ({ ...cashier, active: false }));
  const client = {
    users: vi.fn().mockResolvedValueOnce([owner, cashier]).mockResolvedValueOnce([owner, { ...cashier, active: false }]),
    createUser: vi.fn(),
    updateUser,
    resetUserPassword: vi.fn(),
    revokeUserSessions: vi.fn(),
  } as unknown as POSClient;

  render(<StaffAccounts client={client} currentUserId={owner.id} onError={vi.fn()}/>);
  expect(await screen.findByText('Chipo Phiri')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Edit Chipo Phiri' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Account active' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save account changes' }));

  await waitFor(() => expect(updateUser).toHaveBeenCalledWith(cashier.id, {
    name: 'Chipo Phiri', role: 'CASHIER', active: false,
  }));
});

test('a signed-in staff member can change their password', async () => {
  const changePassword = vi.fn().mockResolvedValue({ ok: true, other_sessions_revoked: 2 });
  const onChanged = vi.fn();
  const client = { changePassword } as unknown as POSClient;

  render(<AccountPassword client={client} onClose={vi.fn()} onChanged={onChanged}/>);
  await userEvent.type(screen.getByLabelText('Current password'), 'old-password-2026');
  await userEvent.type(screen.getByLabelText('New password'), 'new-password-2026');
  await userEvent.type(screen.getByLabelText('Confirm new password'), 'new-password-2026');
  await userEvent.click(screen.getByRole('button', { name: 'Update password' }));

  await waitFor(() => expect(changePassword).toHaveBeenCalledWith('old-password-2026', 'new-password-2026'));
  expect(onChanged).toHaveBeenCalledWith(2);
});
