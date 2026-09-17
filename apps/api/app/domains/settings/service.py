from app.domains.audit.service import record
from app.models.stand_settings import StandSettings


def get_settings(db) -> StandSettings:
    settings = db.get(StandSettings, 1)
    if settings is None:
        settings = StandSettings(id=1)
        db.add(settings)
        db.flush()
    return settings


def dto(settings: StandSettings) -> dict:
    return {
        'business_name': settings.business_name,
        'stand_name': settings.stand_name,
        'location': settings.location,
        'currency_name': settings.currency_name,
        'currency_code': settings.currency_code,
        'currency_symbol': settings.currency_symbol,
        'timezone': settings.timezone,
        'tax_id': settings.tax_id,
        'contact_number': settings.contact_number,
        'tax_label': settings.tax_label,
        'tax_rate_basis_points': settings.tax_rate_basis_points,
        'payment_guidance': settings.payment_guidance,
        'ticket_guidance': settings.ticket_guidance,
        'receipt_footer': settings.receipt_footer,
        'activity_guidance': settings.activity_guidance,
        'guide_workflow': settings.guide_workflow,
        'guide_controls': settings.guide_controls,
        'guide_offline': settings.guide_offline,
        'guide_printing': settings.guide_printing,
    }


def update_settings(db, actor, command) -> dict:
    settings = get_settings(db)
    changes = {}
    for field, value in command.model_dump().items():
        previous = getattr(settings, field)
        if previous != value:
            changes[field] = {'from': previous, 'to': value}
            setattr(settings, field, value)
    record(db, actor, 'STAND_SETTINGS_UPDATED', 'stand_settings', 1,
           {'changed_fields': sorted(changes)})
    db.flush()
    return dto(settings)
