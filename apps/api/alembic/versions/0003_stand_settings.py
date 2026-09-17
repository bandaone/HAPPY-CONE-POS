"""Add the editable single-stand profile and operating copy."""
import sqlalchemy as sa

from alembic import op

revision = '0003'
down_revision = '0002_order_cashier_name'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'stand_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_name', sa.String(length=120), nullable=False),
        sa.Column('stand_name', sa.String(length=120), nullable=False),
        sa.Column('location', sa.String(length=160), nullable=False),
        sa.Column('currency_name', sa.String(length=80), nullable=False),
        sa.Column('currency_code', sa.String(length=3), nullable=False),
        sa.Column('currency_symbol', sa.String(length=6), nullable=False),
        sa.Column('timezone', sa.String(length=80), nullable=False),
        sa.Column('payment_guidance', sa.Text(), nullable=False),
        sa.Column('ticket_guidance', sa.Text(), nullable=False),
        sa.Column('receipt_footer', sa.Text(), nullable=False),
        sa.Column('activity_guidance', sa.Text(), nullable=False),
        sa.Column('guide_workflow', sa.Text(), nullable=False),
        sa.Column('guide_controls', sa.Text(), nullable=False),
        sa.Column('guide_offline', sa.Text(), nullable=False),
        sa.Column('guide_printing', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    table = sa.table('stand_settings',
        sa.column('id', sa.Integer()), sa.column('business_name', sa.String()),
        sa.column('stand_name', sa.String()), sa.column('location', sa.String()),
        sa.column('currency_name', sa.String()), sa.column('currency_code', sa.String()),
        sa.column('currency_symbol', sa.String()), sa.column('timezone', sa.String()),
        sa.column('payment_guidance', sa.Text()), sa.column('ticket_guidance', sa.Text()),
        sa.column('receipt_footer', sa.Text()), sa.column('activity_guidance', sa.Text()),
        sa.column('guide_workflow', sa.Text()), sa.column('guide_controls', sa.Text()),
        sa.column('guide_offline', sa.Text()), sa.column('guide_printing', sa.Text()),
        sa.column('updated_at', sa.DateTime(timezone=True)))
    from datetime import datetime, timezone
    op.bulk_insert(table, [{
        'id': 1, 'business_name': 'Happy Cone Ice Cream', 'stand_name': 'Lusaka stand',
        'location': 'Lusaka', 'currency_name': 'Zambian kwacha', 'currency_code': 'ZMW',
        'currency_symbol': 'K', 'timezone': 'Africa/Lusaka',
        'payment_guidance': 'Cash change is calculated at checkout. Staff must confirm mobile money and card payments and record the provider reference before completing a sale.',
        'ticket_guidance': 'Tickets use the browser print dialog. A printer problem never removes a completed sale; staff can reprint from Sales.',
        'receipt_footer': 'Thank you for choosing Happy Cone.',
        'activity_guidance': 'Review the recorded actions behind sales, payments, stock changes, account administration and cash reconciliation.',
        'guide_workflow': 'Open a business day with the counted float. Choose an item, its size, serving and toppings. Take payment, then give the customer their numbered ticket. The preparation team moves the order through New, Preparing, Ready and Served.',
        'guide_controls': 'Press / to search the menu. Use Tab and Shift + Tab to move between controls, Enter or Space to select, and Escape to close a dialog. On a phone, use the floating order button to jump to checkout.',
        'guide_offline': 'After signing in, the cached menu stays available. Cash orders can be saved on this device. Keep the device and browser data until every order has synced; the queue shows any rejection that needs attention. Network payments need a connection.',
        'guide_printing': 'Use the browser print dialog with a 58 or 80 mm receipt printer, or a normal printer. Sales stay saved if printing fails. Use your browser’s zoom and system text settings. Order states have text labels as well as colour.',
        'updated_at': datetime.now(timezone.utc),
    }])


def downgrade():
    op.drop_table('stand_settings')
