"""Package the reviewed install files and build sources, with an explicit allowlist."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parents[2]
base = root / "banker-request"
version = json.loads((base / "release.json").read_text(encoding="utf-8"))["version"]
files = {
    root / "LICENSE",
    base / "README.md", base / "GREASY-FORK.md", base / "CHANGELOG.md", base / "package.json",
    base / "release.json", base / ".gitignore",
    root / "tools/userscript-pda-source.cjs",
}
for directory, patterns in {
    "src": ["*.cjs", "*.js"], "dist": ["*.user.js", "*.meta.js"],
    "worker": ["worker.mjs", "wrangler.jsonc", "README.md"],
    "test": ["*.cjs", "*.mjs"], "tools": ["*.cjs", "package.py"],
}.items():
    for pattern in patterns:
        files.update((base / directory).glob(pattern))
for name in [
    "script-hub-theme.cjs", "script-hub-theme-client.cjs",
    "script-hub-window-stack.cjs", "script-hub-theme-art.cjs",
    "script-hub-ui-kit.cjs", "script-hub-credentials.cjs",
    "script-hub-platform.cjs", "script-hub-adapter.cjs",
]:
    files.add(root / "script-hub/src" / name)

target = base / f"Banker_Request_Hub_{version}.zip"
manifest = []
with ZipFile(target, "w", compression=ZIP_DEFLATED) as archive:
    for file in sorted(files):
        if not file.is_file() or file.is_symlink():
            raise ValueError(f"Missing or unsafe release entry: {file.relative_to(root)}")
        resolved = file.resolve()
        if not resolved.is_relative_to(root):
            raise ValueError("Release entry escapes the workspace")
        data = file.read_bytes()
        relative = file.relative_to(root).as_posix()
        archive.writestr(relative, data)
        manifest.append(f"{sha256(data).hexdigest()}  {relative}")
    archive.writestr("SHA256SUMS.txt", "\n".join(manifest) + "\n")

with ZipFile(target) as archive:
    assert archive.testzip() is None
    assert len(archive.namelist()) == len(files) + 1
print(f"Created {target.name}: {len(files)} allowlisted files, {target.stat().st_size:,} bytes")
