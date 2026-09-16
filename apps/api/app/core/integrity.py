"""Initial schema integrity guards shared by test initialization and migration 0001.

Keep these version-one guards stable; extend deployed schema with a new migration.
"""
from sqlalchemy import text

APPEND_ONLY = ('audit_events','stock_movements','stock_counts','cash_movements','refunds','order_lines')
PRESERVED = ('orders','payments','business_days')
ORDER_FIELDS = ('id','number','business_day_id','actor_id','total_ngwee','idempotency_key','payload_hash','offline','created_at')
PAYMENT_FIELDS = ('id','order_id','method','amount_ngwee','tendered_ngwee','change_ngwee','provider','reference','confirmed_by','created_at')


def install_integrity_guards(connection):
    dialect = connection.dialect.name
    if dialect == 'sqlite':
        for table in APPEND_ONLY + PRESERVED:
            connection.execute(text(f"CREATE TRIGGER IF NOT EXISTS {table}_no_delete BEFORE DELETE ON {table} BEGIN SELECT RAISE(ABORT, 'Financial and audit history cannot be deleted'); END"))
        for table in APPEND_ONLY:
            connection.execute(text(f"CREATE TRIGGER IF NOT EXISTS {table}_no_update BEFORE UPDATE ON {table} BEGIN SELECT RAISE(ABORT, 'Ledger history is immutable'); END"))
        for table, fields in (('orders',ORDER_FIELDS),('payments',PAYMENT_FIELDS)):
            condition = ' OR '.join(f'NEW.{field} IS NOT OLD.{field}' for field in fields)
            connection.execute(text(f"CREATE TRIGGER IF NOT EXISTS {table}_preserve_values BEFORE UPDATE ON {table} WHEN {condition} BEGIN SELECT RAISE(ABORT, 'Original financial values are immutable'); END"))
        connection.execute(text("CREATE TRIGGER IF NOT EXISTS business_days_closed_immutable BEFORE UPDATE ON business_days WHEN OLD.status = 'CLOSED' BEGIN SELECT RAISE(ABORT, 'Closed business day is immutable'); END"))
    elif dialect == 'postgresql':
        connection.execute(text("""CREATE OR REPLACE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'Financial and audit history is immutable'; END; $$"""))
        for table in APPEND_ONLY + PRESERVED:
            connection.execute(text(f'CREATE TRIGGER {table}_no_delete BEFORE DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION reject_history_mutation()'))
        for table in APPEND_ONLY:
            connection.execute(text(f'CREATE TRIGGER {table}_no_update BEFORE UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION reject_history_mutation()'))
        for table, fields in (('orders',ORDER_FIELDS),('payments',PAYMENT_FIELDS)):
            condition = ' OR '.join(f'NEW.{field} IS DISTINCT FROM OLD.{field}' for field in fields)
            connection.execute(text(f'CREATE TRIGGER {table}_preserve_values BEFORE UPDATE ON {table} FOR EACH ROW WHEN ({condition}) EXECUTE FUNCTION reject_history_mutation()'))
        connection.execute(text("CREATE TRIGGER business_days_closed_immutable BEFORE UPDATE ON business_days FOR EACH ROW WHEN (OLD.status = 'CLOSED') EXECUTE FUNCTION reject_history_mutation()"))
