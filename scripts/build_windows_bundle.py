#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path
from uuid import uuid4

DESTINATIONS = {'installers', 'runtime'}
BUNDLE_DIRECTORIES = ('api', 'config', 'installers', 'runtime', 'scripts', 'web', 'wheelhouse')


def sha256(path: Path) -> str:
    value = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def verify_sha256(path: Path, expected: str) -> None:
    actual = sha256(path)
    if actual.lower() != expected.lower():
        raise ValueError(f'Artifact checksum mismatch for {path.name}: expected {expected}, got {actual}')


def load_dependency_lock(path: Path) -> dict:
    data = json.loads(path.read_text())
    if data.get('schema') != 1:
        raise ValueError('Dependency lock schema must be 1')
    if data.get('architecture') != 'win_amd64':
        raise ValueError('Dependency lock architecture must be win_amd64')
    if data.get('python_version') != '3.12':
        raise ValueError('Dependency lock Python version must be 3.12')
    for artifact in data.get('artifacts', []):
        filename = artifact.get('filename', '')
        if not filename or Path(filename).name != filename or filename in {'.', '..'}:
            raise ValueError(f'Artifact {artifact.get("name", "unknown")} must use a safe filename')
        if artifact.get('destination') not in DESTINATIONS:
            raise ValueError(f'Artifact {artifact.get("name", filename)} has an invalid destination')
        if not re.fullmatch(r'[0-9a-fA-F]{64}', artifact.get('sha256', '')):
            raise ValueError(f'Artifact {artifact.get("name", filename)} must have a SHA-256 checksum')
        if not artifact.get('url', '').startswith('https://'):
            raise ValueError(f'Artifact {artifact.get("name", filename)} must use HTTPS')
    return data


def load_bundle_layout(path: Path) -> tuple[str, ...]:
    data = json.loads(path.read_text())
    if data.get('schema') != 1 or data.get('directories') != list(BUNDLE_DIRECTORIES):
        raise ValueError('Bundle layout does not match the supported Windows release structure')
    return tuple(data['directories'])


def copy_tree(source: Path, target: Path) -> None:
    if not source.is_dir():
        raise FileNotFoundError(f'Required directory is missing: {source}')
    shutil.copytree(source, target, dirs_exist_ok=True)


def assemble_bundle(source_root: Path, output_root: Path, cache_root: Path, version: str) -> Path:
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}', version):
        raise ValueError('Release version contains unsupported characters')
    lock = load_dependency_lock(source_root / 'packaging/windows/dependencies.lock.json')
    load_bundle_layout(source_root / 'packaging/windows/bundle-layout.json')
    missing = [item['filename'] for item in lock['artifacts'] if not (cache_root / item['filename']).is_file()]
    if not (cache_root / 'wheelhouse').is_dir():
        missing.append('wheelhouse/')
    if missing:
        raise FileNotFoundError('Missing cached artifacts: ' + ', '.join(sorted(missing)))
    for item in lock['artifacts']:
        verify_sha256(cache_root / item['filename'], item['sha256'])

    output_root.mkdir(parents=True, exist_ok=True)
    release = output_root / f'HappyCone-Windows-{version}'
    if release.exists():
        raise FileExistsError(f'Release already exists: {release}')
    staging = output_root / f'.HappyCone-Windows-{version}.{uuid4().hex}.tmp'
    try:
        for directory in BUNDLE_DIRECTORIES:
            (staging / directory).mkdir(parents=True, exist_ok=True)
        copy_tree(source_root / 'apps/web/dist', staging / 'web')
        copy_tree(source_root / 'apps/api/app', staging / 'api/app')
        copy_tree(source_root / 'apps/api/alembic', staging / 'api/alembic')
        shutil.copy2(source_root / 'apps/api/alembic.ini', staging / 'api/alembic.ini')
        shutil.copy2(source_root / 'apps/api/pyproject.toml', staging / 'api/pyproject.toml')
        copy_tree(source_root / 'packaging/windows/scripts', staging / 'scripts')
        copy_tree(source_root / 'packaging/windows/config', staging / 'config')
        shutil.copy2(source_root / 'packaging/windows/THIRD-PARTY-NOTICES.md', staging / 'THIRD-PARTY-NOTICES.md')
        copy_tree(cache_root / 'wheelhouse', staging / 'wheelhouse')
        for item in lock['artifacts']:
            shutil.copy2(cache_root / item['filename'], staging / item['destination'] / item['filename'])
        files = []
        for path in sorted(item for item in staging.rglob('*') if item.is_file()):
            files.append({'path': path.relative_to(staging).as_posix(), 'sha256': sha256(path), 'bytes': path.stat().st_size})
        manifest = {
            'schema': 1, 'product': 'Happy Cone POS', 'version': version,
            'architecture': lock['architecture'], 'python_version': lock['python_version'],
            'database_migration': '0008', 'files': files,
        }
        (staging / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        staging.rename(release)
        return release
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def populate_cache(source_root: Path, cache_root: Path, cache_only: bool) -> list[str]:
    lock = load_dependency_lock(source_root / 'packaging/windows/dependencies.lock.json')
    cache_root.mkdir(parents=True, exist_ok=True)
    missing = []
    for item in lock['artifacts']:
        target = cache_root / item['filename']
        if not target.exists():
            if cache_only:
                missing.append(item['filename'])
                continue
            urllib.request.urlretrieve(item['url'], target)
        verify_sha256(target, item['sha256'])
    wheelhouse = cache_root / 'wheelhouse'
    if not wheelhouse.is_dir() or not any(wheelhouse.glob('*.whl')):
        if cache_only:
            missing.append('wheelhouse/')
        else:
            wheelhouse.mkdir(exist_ok=True)
            subprocess.run([
                sys.executable, '-m', 'pip', 'download', '--dest', str(wheelhouse),
                '--platform', 'win_amd64', '--python-version', '312', '--implementation', 'cp',
                '--abi', 'cp312', '--only-binary=:all:', str(source_root / 'apps/api'),
            ], check=True)
    return missing


def main() -> int:
    parser = argparse.ArgumentParser(description='Build the offline Happy Cone Windows release folder')
    parser.add_argument('--version', required=True)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cache-only', action='store_true', help='Use only files already present in the cache')
    args = parser.parse_args()
    source_root = Path(__file__).resolve().parents[1]
    missing = populate_cache(source_root, args.cache, args.cache_only)
    if missing:
        print('Missing cached artifacts: ' + ', '.join(sorted(missing)), file=sys.stderr)
        return 2
    if not args.cache_only:
        subprocess.run(['npm', 'run', 'build'], cwd=source_root / 'apps/web', check=True)
    release = assemble_bundle(source_root, args.output, args.cache, args.version)
    print(release)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
