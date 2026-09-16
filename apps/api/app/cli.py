"""Explicit database setup. Running the API never seeds accounts or stock."""
import argparse
import os
from pathlib import Path
from alembic import command
from alembic.config import Config
from app.core.config import Settings
from app.core.db import make_database, lock_branch
from app.domains.identity.service import create_user
from app.seed import seed_demo


def password_arguments(parser):
    password = parser.add_mutually_exclusive_group(required=True)
    password.add_argument('--password', help='Prefer --password-env to avoid exposing passwords in process arguments')
    password.add_argument('--password-env', metavar='VARIABLE', help='Environment variable containing password')


def main():
    parser = argparse.ArgumentParser(description='Happy Cone database maintenance')
    subparsers = parser.add_subparsers(dest='command', required=True)
    subparsers.add_parser('migrate', help='Apply versioned schema migrations')
    seed_parser = subparsers.add_parser('seed', help='Explicitly create development users, catalog and stock')
    password_arguments(seed_parser)
    user_parser = subparsers.add_parser('create-user', help='Create a user without installing demo data')
    user_parser.add_argument('--username', required=True)
    user_parser.add_argument('--name', required=True)
    user_parser.add_argument('--role', required=True, choices=('CASHIER','SERVER','MANAGER','OWNER_ADMIN'))
    password_arguments(user_parser)
    args = parser.parse_args()
    settings = Settings()
    if args.command == 'migrate':
        config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
        command.upgrade(config, 'head')
        print('Database migrations applied.')
        return
    if args.command == 'seed' and settings.app_env == 'production':
        parser.error('Development seeding is disabled when APP_ENV=production; use create-user for administrator setup')
    password = args.password if args.password is not None else os.environ.get(args.password_env, '')
    if not 12 <= len(password) <= 256:
        parser.error('Password must contain 12–256 characters')
    engine, factory = make_database(settings.database_url)
    try:
        with factory.begin() as db:
            lock_branch(db)
            if args.command == 'seed':
                seed_demo(db, password)
            else:
                create_user(db, username=args.username, name=args.name, role=args.role, password=password)
    except ValueError as error:
        parser.error(str(error))
    finally:
        engine.dispose()
    print('Development users and catalog are ready. Existing passwords were preserved.'
          if args.command == 'seed' else 'User created. No demo data was installed.')


if __name__ == '__main__':
    main()
