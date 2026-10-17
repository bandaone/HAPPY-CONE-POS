from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "202610170001_reporting.sql"


def main() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    reporting_tables = (
        "reporting_stores",
        "reporting_store_owners",
        "reporting_events",
        "reporting_days",
        "reporting_inventory",
    )
    for table in reporting_tables:
        assert f"alter table public.{table} enable row level security" in sql
    assert "unique (store_id, sequence)" in sql
    assert "security definer" in sql
    assert "set search_path = ''" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
    assert "grant select on" in sql
    assert "to authenticated" in sql
    assert "for insert to authenticated" not in sql
    assert "for update to authenticated" not in sql
    assert "for delete to authenticated" not in sql
    print("Reporting SQL security and idempotency invariants are present.")


if __name__ == "__main__":
    main()
