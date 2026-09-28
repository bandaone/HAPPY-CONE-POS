"""Replace untouched preparation and ticket guidance with cashier-only wording."""
import sqlalchemy as sa

from alembic import op

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


GUIDANCE = {
    'ticket_guidance': (
        'Tickets use the browser print dialog. A printer problem never removes a completed sale; staff can reprint from Sales.',
        'Receipts use the browser print dialog. A printer problem never removes a completed sale; staff can reprint from Sales.',
    ),
    'guide_workflow': (
        'Open a business day with the counted float. Choose an item, its size, serving and toppings. Take payment, then give the customer their numbered ticket. The preparation team moves the order through New, Preparing, Ready and Served.',
        'Open a business day with the counted float. Choose each item, size, serving and extras, then take payment. Print or close the customer receipt and begin the next sale. Stock and reports update when the sale is accepted.',
    ),
    'guide_controls': (
        'Press / to search the menu. Use Tab and Shift + Tab to move between controls, Enter or Space to select, and Escape to close a dialog. On a phone, use the floating order button to jump to checkout.',
        'Press / to search the menu. Use Tab and Shift + Tab to move between controls, Enter or Space to select, and Escape to close a dialog. On a phone, use the floating sale button to jump to checkout.',
    ),
    'guide_offline': (
        'After signing in, the cached menu stays available. Cash orders can be saved on this device. Keep the device and browser data until every order has synced; the queue shows any rejection that needs attention. Network payments need a connection.',
        'After signing in, the cached menu stays available. Cash sales can be saved on this device. Keep the device and browser data until every sale has synced; rejected sales stay in the sync list for manager review. Mobile money and card payments need a connection.',
    ),
    'guide_printing': (
        'Use the browser print dialog with a 58 or 80 mm receipt printer, or a normal printer. Sales stay saved if printing fails. Use your browser’s zoom and system text settings. Order states have text labels as well as colour.',
        'Use the browser print dialog with a 58 or 80 mm receipt printer, or a normal printer. Sales stay saved if printing fails, and receipts can be reprinted from Sales. Use your browser’s zoom and system text settings.',
    ),
}


def _replace(source_index, target_index):
    for column, values in GUIDANCE.items():
        op.execute(sa.text(
            f'UPDATE stand_settings SET {column} = :replacement WHERE {column} = :existing'
        ).bindparams(existing=values[source_index], replacement=values[target_index]))


def upgrade():
    _replace(0, 1)


def downgrade():
    _replace(1, 0)
