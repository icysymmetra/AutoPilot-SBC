"""Package the current manifest version, preserving the existing unpacked build key."""
import json
import shutil
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
version = manifest['version']
destination = root / 'artifacts' / f'autopilotsbc-fc27-{version}'
destination.mkdir(parents=True, exist_ok=True)
for folder in ('page', 'solver', 'icons'):
    shutil.copytree(root / folder, destination / folder, dirs_exist_ok=True,
        ignore=shutil.ignore_patterns('*.test.mjs', '*.test.js'))
(destination / 'data').mkdir(exist_ok=True)
shutil.copy2(root / 'data/changelog.json', destination / 'data/changelog.json')
for name in ('background.js', 'content-script.js'):
    shutil.copy2(root / name, destination / name)
previous = root / 'artifacts/autopilotsbc-fc27-1.11.2/manifest.json'
if previous.exists() and 'key' not in manifest:
    key = json.loads(previous.read_text(encoding='utf-8-sig')).get('key')
    if key: manifest['key'] = key
(destination / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
archive = root / 'artifacts' / f'AutopilotSBC-FC27-{version}.zip'
with ZipFile(archive, 'w', ZIP_DEFLATED) as zipped:
    for path in sorted(destination.rglob('*')):
        if path.is_file(): zipped.write(path, path.relative_to(destination))
print(destination)
print(archive)
