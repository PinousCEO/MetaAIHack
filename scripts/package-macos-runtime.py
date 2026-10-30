"""Bundle the official ASP.NET runtime; verify the archive against release metadata."""
import hashlib
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
VERSION = '8.0.33'
RID = 'osx-arm64'
ART = ROOT / 'artifacts'
ART.mkdir(exist_ok=True)
metadata_url = 'https://builds.dotnet.microsoft.com/dotnet/release-metadata/8.0/releases.json'
with urllib.request.urlopen(metadata_url, timeout=60) as response:
    metadata = json.load(response)
release = next(item for item in metadata['releases'] if item['release-version'] == VERSION)
entry = next(item for item in release['aspnetcore-runtime']['files'] if item['rid'] == RID and item['name'].endswith('.tar.gz'))
archive = ART / f'aspnetcore-runtime-{VERSION}-{RID}.tar.gz'
if not archive.exists() or hashlib.sha512(archive.read_bytes()).hexdigest() != entry['hash']:
    with urllib.request.urlopen(entry['url'], timeout=120) as response:
        archive.write_bytes(response.read())
if hashlib.sha512(archive.read_bytes()).hexdigest() != entry['hash']:
    raise RuntimeError('Official runtime archive hash mismatch')
with tarfile.open(archive) as bundle:
    bundle.extractall(ART / 'macos/runtime', filter='data')
print(f'Bundled official ASP.NET Core {VERSION} {RID}; SHA512 verified. This does not assert notarization.')
