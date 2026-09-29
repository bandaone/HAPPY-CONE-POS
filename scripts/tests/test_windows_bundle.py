import hashlib
import json
from pathlib import Path

import pytest

from scripts.build_windows_bundle import (
    assemble_bundle, load_bundle_layout, load_dependency_lock, verify_sha256, verify_wheelhouse,
    write_wheelhouse_manifest,
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_lock(path: Path, artifacts, architecture='win_amd64'):
    path.write_text(json.dumps({
        'schema': 1,
        'architecture': architecture,
        'python_version': '3.12',
        'artifacts': artifacts,
    }))


def source_tree(tmp_path: Path) -> Path:
    source = tmp_path / 'source'
    files = {
        'apps/web/dist/index.html': b'<title>Happy Cone</title>',
        'apps/api/app/__init__.py': b'',
        'apps/api/alembic.ini': b'[alembic]',
        'apps/api/alembic/env.py': b'',
        'apps/api/pyproject.toml': b'[project]',
        'packaging/windows/scripts/Install-HappyCone.ps1': b'Write-Host install',
        'packaging/windows/config/Caddyfile.template': b':{{PORT}}',
    }
    for name, data in files.items():
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    (source / 'packaging/windows/bundle-layout.json').write_text(json.dumps({
        'schema': 1,
        'directories': ['api', 'config', 'installers', 'runtime', 'scripts', 'web', 'wheelhouse'],
    }))
    (source / 'packaging/windows/THIRD-PARTY-NOTICES.md').write_text('# Notices\n')
    return source


def test_load_dependency_lock_rejects_unsafe_or_wrong_architecture(tmp_path):
    lock = tmp_path / 'lock.json'
    write_lock(lock, [], architecture='linux_x86_64')
    with pytest.raises(ValueError, match='win_amd64'):
        load_dependency_lock(lock)

    write_lock(lock, [{
        'name': 'unsafe', 'filename': '../escape.exe', 'url': 'https://vendor.invalid/file',
        'sha256': '0' * 64, 'destination': 'installers',
    }])
    with pytest.raises(ValueError, match='safe filename'):
        load_dependency_lock(lock)


def test_verify_sha256_rejects_altered_artifact(tmp_path):
    artifact = tmp_path / 'tool.exe'
    artifact.write_bytes(b'altered')
    with pytest.raises(ValueError, match='checksum'):
        verify_sha256(artifact, digest(b'expected'))


def test_load_bundle_layout_rejects_unexpected_structure(tmp_path):
    layout = tmp_path / 'layout.json'
    layout.write_text(json.dumps({'schema': 1, 'directories': ['web']}))
    with pytest.raises(ValueError, match='layout'):
        load_bundle_layout(layout)


def test_assemble_bundle_requires_every_cached_artifact(tmp_path):
    source = source_tree(tmp_path)
    lock = source / 'packaging/windows/dependencies.lock.json'
    write_lock(lock, [{
        'name': 'python', 'filename': 'python.exe', 'url': 'https://vendor.invalid/python.exe',
        'sha256': digest(b'python'), 'destination': 'installers',
    }])
    with pytest.raises(FileNotFoundError, match='python.exe'):
        assemble_bundle(source, tmp_path / 'out', tmp_path / 'cache', '1.0.0')
    assert not (tmp_path / 'out' / 'HappyCone-Windows-1.0.0').exists()


def test_assemble_bundle_emits_exact_layout_and_verified_manifest(tmp_path):
    source = source_tree(tmp_path)
    lock = source / 'packaging/windows/dependencies.lock.json'
    artifacts = [
        {'name': 'python', 'filename': 'python.exe', 'url': 'https://vendor.invalid/python.exe',
         'sha256': digest(b'python'), 'destination': 'installers'},
        {'name': 'caddy', 'filename': 'caddy.exe', 'url': 'https://vendor.invalid/caddy.exe',
         'sha256': digest(b'caddy'), 'destination': 'runtime'},
    ]
    write_lock(lock, artifacts)
    cache = tmp_path / 'cache'
    cache.mkdir()
    (cache / 'python.exe').write_bytes(b'python')
    (cache / 'caddy.exe').write_bytes(b'caddy')
    (cache / 'wheelhouse').mkdir()
    (cache / 'wheelhouse' / 'tzdata.whl').write_bytes(b'wheel')
    write_wheelhouse_manifest(cache)

    release = assemble_bundle(source, tmp_path / 'out', cache, '1.0.0')

    assert release.name == 'HappyCone-Windows-1.0.0'
    assert {path.name for path in release.iterdir()} == {
        'api', 'config', 'installers', 'release-manifest.json', 'runtime', 'scripts',
        'THIRD-PARTY-NOTICES.md', 'web', 'wheelhouse'
    }
    manifest = json.loads((release / 'release-manifest.json').read_text())
    assert manifest['version'] == '1.0.0'
    assert manifest['architecture'] == 'win_amd64'
    assert manifest['database_migration'] == '0008'
    recorded = {entry['path']: entry['sha256'] for entry in manifest['files']}
    assert recorded['installers/python.exe'] == digest(b'python')
    assert recorded['runtime/caddy.exe'] == digest(b'caddy')
    assert recorded['wheelhouse/tzdata.whl'] == digest(b'wheel')
    assert 'wheelhouse/manifest.json' in recorded
    assert all('..' not in name and not name.startswith('/') for name in recorded)


def test_verify_wheelhouse_rejects_an_altered_cached_wheel(tmp_path):
    (tmp_path / 'wheelhouse').mkdir()
    wheel = tmp_path / 'wheelhouse/example.whl'
    wheel.write_bytes(b'original')
    write_wheelhouse_manifest(tmp_path)
    wheel.write_bytes(b'altered')
    with pytest.raises(ValueError, match='checksum'):
        verify_wheelhouse(tmp_path)
