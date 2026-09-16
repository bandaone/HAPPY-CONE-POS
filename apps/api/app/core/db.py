from sqlalchemy import create_engine, event, update
from sqlalchemy.orm import sessionmaker
from app.models import Base, BranchLock


def make_database(url: str, initialize: bool = False):
    sqlite = url.startswith('sqlite')
    engine = create_engine(url, connect_args={'check_same_thread': False, 'timeout': 30} if sqlite else {}, pool_pre_ping=True)
    if sqlite:
        @event.listens_for(engine, 'connect')
        def sqlite_settings(connection, _):
            cursor = connection.cursor()
            cursor.execute('PRAGMA foreign_keys=ON')
            cursor.execute('PRAGMA busy_timeout=30000')
            cursor.close()
    factory = sessionmaker(engine, expire_on_commit=False)
    if initialize:
        Base.metadata.create_all(engine)
        from app.core.integrity import install_integrity_guards
        with engine.begin() as connection:
            install_integrity_guards(connection)
        with factory.begin() as db:
            if db.get(BranchLock, 1) is None:
                db.add(BranchLock(id=1, revision=0))
    return engine, factory


def lock_branch(db):
    """Serialize financial/stock mutations before reading state.

    UPDATE takes a row lock on PostgreSQL and a write lock on SQLite. It also
    advances a durable event revision in the same transaction as each mutation.
    """
    result = db.execute(update(BranchLock).where(BranchLock.id == 1).values(revision=BranchLock.revision + 1))
    if result.rowcount != 1:
        raise RuntimeError('Database is not initialized. Run python -m app.cli migrate.')
