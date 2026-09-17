from datetime import datetime

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import UTCDateTime

from .base import Base, utcnow


class StandSettings(Base):
    __tablename__ = 'stand_settings'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    business_name: Mapped[str] = mapped_column(String(120), default='CREAMY HEAVEN LIMITED')
    stand_name: Mapped[str] = mapped_column(String(120), default='Lusaka stand')
    location: Mapped[str] = mapped_column(String(160), default='Lusaka')
    currency_name: Mapped[str] = mapped_column(String(80), default='Zambian kwacha')
    currency_code: Mapped[str] = mapped_column(String(3), default='ZMW')
    currency_symbol: Mapped[str] = mapped_column(String(6), default='K')
    timezone: Mapped[str] = mapped_column(String(80), default='Africa/Lusaka')
    tax_id: Mapped[str] = mapped_column(String(40), default='1002681530')
    contact_number: Mapped[str] = mapped_column(String(40), default='0771450074')
    tax_label: Mapped[str] = mapped_column(String(80), default='STANDARD RATED (A)')
    tax_rate_basis_points: Mapped[int] = mapped_column(Integer, default=1600)
    payment_guidance: Mapped[str] = mapped_column(Text, default='Cash change is calculated at checkout. Staff must confirm mobile money and card payments and record the provider reference before completing a sale.')
    ticket_guidance: Mapped[str] = mapped_column(Text, default='Tickets use the browser print dialog. A printer problem never removes a completed sale; staff can reprint from Sales.')
    receipt_footer: Mapped[str] = mapped_column(Text, default='Thank you for choosing Happy Cone.')
    activity_guidance: Mapped[str] = mapped_column(Text, default='Review the recorded actions behind sales, payments, stock changes, account administration and cash reconciliation.')
    guide_workflow: Mapped[str] = mapped_column(Text, default='Open a business day with the counted float. Choose an item, its size, serving and toppings. Take payment, then give the customer their numbered ticket. The preparation team moves the order through New, Preparing, Ready and Served.')
    guide_controls: Mapped[str] = mapped_column(Text, default='Press / to search the menu. Use Tab and Shift + Tab to move between controls, Enter or Space to select, and Escape to close a dialog. On a phone, use the floating order button to jump to checkout.')
    guide_offline: Mapped[str] = mapped_column(Text, default='After signing in, the cached menu stays available. Cash orders can be saved on this device. Keep the device and browser data until every order has synced; the queue shows any rejection that needs attention. Network payments need a connection.')
    guide_printing: Mapped[str] = mapped_column(Text, default='Use the browser print dialog with a 58 or 80 mm receipt printer, or a normal printer. Sales stay saved if printing fails. Use your browser’s zoom and system text settings. Order states have text labels as well as colour.')
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)
