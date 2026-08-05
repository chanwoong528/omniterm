# OmniTerm

Tauri v2 + React + TypeScript SSH/SFTP client. Rust backend uses `ssh2` (libssh2).

## Releasing

Two workflows are involved and they interact in a way that is easy to get wrong:

- **Bump Version** (`.github/workflows/bump-version.yml`) — runs on every `main` push, bumps the **patch** version and pushes a tag. Skipped when the head commit message contains `[skip ci]`, or when only `website/**` / `.github/**` changed.
- **Release** (`.github/workflows/release.yml`) — builds macOS aarch64/x64 + Windows x64 and uploads to the GitHub Release. Its `check` job reads the **tagged commit's message** and skips the build if it contains `[skip release]`.

### The trap

Every release commit needs `[skip ci]` (or Bump Version bumps again on top of it). But GitHub honors `[skip ci]` on **tag pushes too**, so pushing the tag does **not** start the Release build. Every release since v0.2.1 was therefore built by dispatching the workflow manually **on the tag ref**.

Two rules follow:

- **Never put `[skip release]` in a release commit.** The `check` job reads the tagged commit even for a manual dispatch on a tag ref, so it would skip the build you just asked for. This is why `scripts/bump-and-release.sh` and `scripts/re-release.sh` cannot be used when you actually want installers — they add that flag (they exist for tag-only pushes).
- **`bump-and-release.sh` only does patch/minor/major.** Any other target version (e.g. 0.2.2 → 0.3.1) must be done by hand.

### Steps

```bash
# 1. Commit the feature work normally (no [skip ci] needed on this one).

# 2. Set the SAME version in all manifests:
#    package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml
#    then regenerate both lockfiles:
npm install --package-lock-only
(cd src-tauri && cargo check)   # updates the `app` entry in Cargo.lock

# 3. Version-bump commit MUST have [skip ci] and MUST NOT have [skip release]:
git add package.json package-lock.json src-tauri/tauri.conf.json \
        src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: release vX.Y.Z [skip ci]"
git push origin main

# 4. Tag and push:
git tag vX.Y.Z && git push origin vX.Y.Z

# 5. Start the build manually ON THE TAG (the tag push will not do it):
gh workflow run release.yml --ref vX.Y.Z
gh run watch <run-id> --exit-status

# 6. Only after the build succeeds, replace the release notes (see below).
```

Docs-only pushes to `main` (this file, `README.md`, `docs/**`) should also carry `[skip ci]` — they are not in Bump Version's `paths-ignore`, so otherwise they mint a pointless version and tag.

## Release notes

`release.yml` sets a generic `releaseBody` whose asset names are **stale and wrong**. Always overwrite it after the build:

```bash
gh release edit vX.Y.Z --notes-file <file>
```

Write them in **English**, matching v0.3.1 / v0.3.2. Use only the sections that apply, in this order:

- `## OmniTerm vX.Y.Z` — optionally one sentence framing the release.
- `### ✨ New` — capabilities that did not exist before.
- `### 💅 Improved` — existing things that got better.
- `### 🔧 Under the hood` — only decisions that explain behavior the user can observe (why a limit exists, what migrates automatically). Not a changelog of refactors.
- `### 📦 Downloads` — the table below.

Voice:

- Lead with **what the user can now do**, then why it matters. Implementation is context, not the headline.
- Bold the lead-in phrase of each bullet, then explain in plain prose.
- Be concrete: name the real port, file, or button (`localhost:5432`, "Use port 15432 instead"), not "improved UX".
- **Say what is not included** when the scope is partial — v0.3.1 stated that `-R` and `-D` were missing.
- Mention automatic migrations, so nobody wonders whether their saved data survived.

Fixed tail of every release:

```markdown
### 📦 Downloads

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `Omniterm_X.Y.Z_aarch64.dmg` |
| macOS (Intel) | `Omniterm_X.Y.Z_x64.dmg` |
| Windows | `Omniterm_X.Y.Z_x64.exe` or `.msi` |

> **Note:** builds are not yet code-signed. On macOS run `xattr -cr /Applications/OmniTerm.app` if you see a "damaged" warning; on Windows choose **More info → Run anyway** on the SmartScreen prompt.

**Full changelog:** [vPREV...vX.Y.Z](https://github.com/chanwoong528/omniterm/compare/vPREV...vX.Y.Z)
```

Asset names come from `assetNamePattern: '[name]_[version]_[arch][ext]'` in `release.yml` — note the bundle name is `Omniterm`, not `OmniTerm`. Verify against the real assets before publishing:

```bash
gh release view vX.Y.Z --json assets -q '.assets[].name'
```

Drop the code-signing note once macOS signing secrets are configured (`docs/MACOS_SIGNING.md`).
