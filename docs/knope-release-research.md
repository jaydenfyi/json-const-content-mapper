# Knope changesets and npm release recommendation

Research only. These are illustrative files to implement later, not installed configuration. Sources reflect the current official documentation and Knope `0.23.1` source/release consulted during this investigation.

## Recommendation

Use **Knope change files only → a rolling release PR → human merge → tests → GitHub release/tag → npm trusted publish in the same job**. Keep Nub and `nub.lock`. Do not add Changesets CLI, conventional-commit enforcement, `npm ci`, or an npm lockfile.

Knope supports both change files and Conventional Commits by default. `[changes] ignore_conventional_commits = true` makes release intent explicit in reviewed `.changeset/*.md` files and prevents commit subjects from independently affecting version/changelog. This setting requires Knope 0.22.2+; the old per-`PrepareRelease` setting is deprecated. Change files are consumed/deleted by `PrepareRelease`, which bumps versions, writes the changelog, and stages changes, but does not commit. [1][2][3]

The official PR recipe already supplies the needed branch/commit/push/PR steps. `CreatePullRequest` updates the existing PR's title/body if one exists. The recommendation below adapts that recipe for a single npm package and keeps publishing in the release job rather than relying on a second tag/release-triggered workflow. [4][5]

## Local facts and validation limits

Read locally: `package.json`, `README.md`, and `nub.lock`. This is `json-const-content-mapper@0.1.0`, ESM, Node `>=22`; `build` runs `tsc -p tsconfig.build.json`, `prepack` runs `nub run build`, and tests build before invoking Node's test runner. Development declares Nub `^0.6.0`; the lock pins TypeScript `7.1.0-dev.20261013.1`. The inspected lock has no root package release-version field.

Additional checks supplied by the parent investigation, not rerun here:

- No `.git` or `.github` directory exists locally. GitHub owner/repository/default branch, protections, prior tags, and credentials cannot be inferred or tested.
- Homebrew Knope `0.23.0` is installed but cannot start: missing `/opt/homebrew/opt/zlib/lib/libz.1.dylib`. No environment repair attempted. The snippets were checked against documentation/source, **not executed with Knope**.
- `nub run test`: 111 passing tests; `nub run typecheck`: passes.
- `npm pack --dry-run` (including `prepack` → `nub run build`): succeeds; contents are `dist/*.js`, README, LICENSE, and package.json. This does not test a clean CI install, real publishing, or provenance.
- npm warns about Nub in `devEngines.packageManager`, but `onFail: "warn"` permits the operation. Preserve that declaration.
- `npm view json-const-content-mapper name version repository --json`: public registry E404. This is not proof that the name is claimable.
- `package.json` lacks `repository`; add the actual matching GitHub URL before trusted publishing/provenance. [9][10]

## Version files and change-file format

Use `versioned_files = ["package.json"]`. Knope supports `package.json` directly. It also supports `package-lock.json` v2+ (updating both root `version` and `packages[""].version` for a root package), but this project has no such lock. Knope 0.23.1's supported filename dispatch does **not** include `nub.lock`; do not list it or invent a regex to rewrite dependency versions. Keep Nub's frozen install as the compatibility check after a manifest version bump. [6][7]

For the single `[package]` form, use the change-file package key **`default`**, not the npm name. This exact key appears in the official single-package fixture. [8]

Illustrative `.changeset/fix-json-diagnostic.md`:

```markdown
---
default: patch
---

# Correct a JSON diagnostic

Explain the user-visible change here.
```

Authors can instead run `knope document-change` once the following workflow exists. Choose `patch`, `minor`, or `major` deliberately; review the resulting version in the release PR, especially while the package is pre-1.0. No file is needed for changes that should not release. No `.changeset/config.json` is required. [1][3]

## Illustrative `knope.toml`

Replace `OWNER` / `REPOSITORY` and `main` with verified values. Reserve branch `release` for automation; its history is overwritten, as in the official recipe. [4]

```toml
[package]
versioned_files = ["package.json"]
changelog = "CHANGELOG.md"

[changes]
ignore_conventional_commits = true

[github]
owner = "OWNER"
repo = "REPOSITORY"

[[workflows]]
name = "document-change"
[[workflows.steps]]
type = "CreateChangeFile"

[[workflows]]
name = "prepare-release"
[[workflows.steps]]
type = "Command"
command = "git switch -c release"
[[workflows.steps]]
type = "PrepareRelease"
[[workflows.steps]]
type = "Command"
command = "git commit -m \"chore: prepare release $version\""
[[workflows.steps]]
type = "Command"
command = "git push --force --set-upstream origin release"
[[workflows.steps]]
type = "CreatePullRequest"
base = "main"
[workflows.steps.title]
template = "chore: prepare release $version"
[workflows.steps.body]
template = "Merging this PR publishes the next npm version.\n\n$changelog"

[[workflows]]
name = "release"
[[workflows.steps]]
type = "Release"
```

`PrepareRelease` normally errors when there are no release changes. Unlike the recipe's blanket `continue-on-error: true`, the next snippet skips only when there are no change files, so malformed changesets and genuine failures remain visible. Keep `.changeset` for actual release `.md` files, not a README. [2][4]

## Illustrative `.github/workflows/prepare-release.yml`

Use a repository-scoped fine-grained PAT secret `RELEASE_PR_TOKEN` with **Contents: read/write** and **Pull requests: read/write**, or replace it with a GitHub App installation token with equivalent permissions. Use the same token for checkout/push and Knope's PR API. This token is a GitHub credential, **not** an npm publish token. Restrict who can modify these workflows and the reserved release branch. [4][11]

```yaml
name: Prepare release PR
on:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: prepare-release
  cancel-in-progress: false
jobs:
  prepare:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
          token: ${{ secrets.RELEASE_PR_TOKEN }}
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
      - uses: knope-dev/action@v2.1.2
        with:
          version: 0.23.1
      - name: Prepare only when change files exist
        shell: bash
        env:
          GITHUB_TOKEN: ${{ secrets.RELEASE_PR_TOKEN }}
        run: |
          shopt -s nullglob
          changes=(.changeset/*.md)
          if (( ${#changes[@]} == 0 )); then
            printf '%s\n' 'No change files; nothing to release.'
            exit 0
          fi
          knope prepare-release
```

A merged release deletes its change files, so the next `main` push normally has nothing to prepare. Changes landing on `main` while a preview is open rebuild the preview from current `main`. Serialize preparation and require release-PR CI to be green/up to date before a human merges; that repository policy is not provided by these snippets. A stale preview must not be merged while preparation is running.

## Illustrative `.github/workflows/release.yml`

The **job gate is essential**: only an actually merged PR from this repository's reserved `release` branch may publish. Ordinary PR merges and closing without merge do not release. Explicitly check out `merge_commit_sha`, not a moving `main` or the deleted head branch. Re-run validation on the merged code even if the PR had checks. This follows the official recipe's closed-PR trigger, with a same-repository guard added. [4]

```yaml
name: Release
on:
  pull_request:
    types: [closed]
    branches: [main]
permissions:
  contents: read
concurrency:
  group: npm-release
  cancel-in-progress: false
jobs:
  release:
    if: >-
      github.event.pull_request.merged == true && github.event.pull_request.head.ref == 'release' && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.event.pull_request.merge_commit_sha }}
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          package-manager-cache: false
      - uses: nubjs/setup-nub@v0
        with:
          nub-version: "0.6.0"
          provision-node: false
          shim: false
          package-manager-cache: false
      - run: npm install --global npm@11
      - run: node --version && npm --version && nub --version
      - run: nub install --frozen-lockfile
      - run: nub run test
      - run: nub run typecheck
      - run: npm pack --dry-run
      - uses: knope-dev/action@v2.1.2
        with:
          version: 0.23.1
      - run: knope release
        env:
          GITHUB_TOKEN: ${{ github.token }}
      - run: npm publish --access public
```

Nub's official action supports `nub-version`, `provision-node: false` (retain setup-node's Node), and `shim: false` (do not intercept the real npm CLI). Pinning Nub 0.6.0 matches the repository's declared range; actual clean-run compatibility remains untested. No `npm ci` or npm cache is used, and no npm lock is created by the global npm upgrade. `prepack` remains intact: real `npm pack`/`npm publish` invokes `nub run build`. [12]

`actions/checkout@v6` and `actions/setup-node@v6` exist and are the majors used in current npm official examples. Current official Knope action release is **v2.1.2**; its `version` input selects the **Knope binary**, currently **0.23.1**, not the action version. Pin verified full action SHAs at implementation time if required by repository policy; the major/action tags above are mutable references. [9][13][14][15]

### Release/tag order and failure recovery

1. Preparation changes versions/changelog and removes change files **only on the release branch**.
2. A human merges the reviewed release PR; that merge commit contains the final version/changelog.
3. The release job installs with Nub, builds/tests/typechecks/packs that exact merge commit.
4. `knope release` creates the GitHub release and its `vVERSION` tag at that commit, taking notes from the matching changelog section. Do not run `PrepareRelease` again here. With GitHub configured, no extra `git tag`/`git push --tags` step is needed. With assets configured, Knope creates a draft, uploads assets, then publishes it; this npm package needs no release assets. [16]
5. `npm publish` publishes that version using OIDC. A dependency prerelease does not make this package's own `0.1.x` release a prerelease.

GitHub release creation and npm publishing are **not transactional**. This order can leave a GitHub release/tag without an npm package if npm fails. Check registry state, then retry only the failed npm publish for the same immutable merge commit/version; do not blindly rerun the full job, delete successful tags, or try to republish an existing npm version. Knope documents existing-release conflicts; a future recovery-only manual workflow would need its own deliberate gate. [16]

**Do not split step 5 into an `on: release` or tag-push workflow while creating releases with `GITHUB_TOKEN`.** GitHub generally suppresses workflows caused by that token; `workflow_dispatch`/`repository_dispatch` are exceptions. Current docs also allow token-created PR `opened`/`synchronize`/`reopened` runs in an _approval-required_ state, but not other PR activities such as `closed`. Thus use the PAT/App token for automatic release-PR checks, retain a human merge, and publish directly in this merged-PR job. Automated merging with `GITHUB_TOKEN` would require redesign of the trigger chain. [11]

## npm trusted publisher and first-publish setup

Before automation is enabled:

1. Create/identify the actual GitHub repository, verify its default branch and package name ownership, and push source/workflows. Add matching repository metadata, for example:
   ```json
   "repository": {
     "type": "git",
     "url": "git+https://github.com/OWNER/REPOSITORY.git"
   }
   ```
   Use exact real owner/repository casing. npm requires the metadata to match the GitHub repository; provenance additionally requires public source and a public package. Unscoped packages are always public. [9][10][17]
2. **Likely bootstrap: publish `0.1.0` manually once**, from the reviewed committed source, after Nub frozen install/test/typecheck and a real package-content review. Use an npm account with the appropriate package rights, interactive `npm login`, and account 2FA, then `npm publish --access public`. Do not introduce a CI npm token solely for bootstrap. Package settings/trusted-publisher registration presume an existing package; registry E404 and name policies still require human verification. Current npm docs also offer staged first publishing with a public placeholder, but it adds an approval flow and is not needed for this recommendation. [17][18]
3. Record/tag the exact bootstrap source as `v0.1.0` and push that tag (and optionally its GitHub release) **after confirming the initial publish succeeded**. This is the baseline; the first automated release should increment it, not republish `0.1.0`. Future `Release` uses `vVERSION` for single-package config. [16]
4. On npmjs.com → package settings → Trusted Publisher, choose GitHub Actions. Set actual owner, repo, and workflow filename **`release.yml`**, not its path. If using a GitHub Environment, bind its exact name and add the matching `environment` to the release job; none is assumed here. Explicitly allow **direct `npm publish`**, not stage-only publishing. Current defaults can be stage-only. [9]
5. Use GitHub-hosted `ubuntu-latest`, **Node >=22.14.0 and npm >=11.5.1**. Merely setting Node 22 or satisfying the package's `>=22` engine is not enough. The example chooses Node 24 and explicitly upgrades to npm 11; verify the logged resolved versions. OIDC requires job permission `id-token: write`; GitHub release creation separately requires `contents: write`. No `NPM_TOKEN`/`NODE_AUTH_TOKEN` is required for public dependency installs or OIDC publishing. Provenance is automatically generated for supported public GitHub releases; `--provenance` is unnecessary. [9]
6. Current npm docs require a newly created trust configuration's **first successful publish within two days** or it expires. Configure it when the next real version is ready. After a successful OIDC release, npm recommends “Require two-factor authentication and disallow tokens”; that setting does not disable OIDC. [9]

Unverified external state: npm ownership/name eligibility/2FA, real GitHub repository visibility and metadata, branch protection and required CI checks, PAT/App scope and expiry, trusted-publisher identity and direct-publish allowance, package-name case, and clean Ubuntu installation of the pinned TypeScript prerelease. No live auth, release, tag, or registry write was attempted. The initial manual publish would not have CI build provenance; subsequent eligible OIDC publishes would.

## Primary sources

[1]: https://knope.tech/reference/concepts/changeset/
[2]: https://knope.tech/reference/config-file/steps/prepare-release/
[3]: https://knope.tech/reference/config-file/changes/
[4]: https://knope.tech/recipes/1-preview-releases-with-pull-requests/
[5]: https://knope.tech/reference/config-file/steps/create-pull-request/
[6]: https://knope.tech/reference/config-file/packages/
[7]: https://github.com/knope-dev/knope/blob/knope/v0.23.1/crates/knope-versioning/src/versioned_file/mod.rs
[8]: https://github.com/knope-dev/knope/blob/knope/v0.23.1/crates/knope/tests/prepare_release/ignore_conventional_commits_toplevel/in/.changeset/a_new_feature.md
[9]: https://docs.npmjs.com/trusted-publishers/
[10]: https://docs.npmjs.com/generating-provenance-statements/
[11]: https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow
[12]: https://nubjs.com/docs/deployment/github-action
[13]: https://github.com/knope-dev/action/releases/tag/v2.1.2
[14]: https://github.com/knope-dev/knope/releases/tag/knope/v0.23.1
[15]: https://github.com/knope-dev/action/blob/v2.1.2/action.yml
[16]: https://knope.tech/reference/config-file/steps/release/
[17]: https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/
[18]: https://docs.npmjs.com/staged-publishing/

- [CreateChangeFile step](https://knope.tech/reference/config-file/steps/create-change-file/)
- [Changesets format and differences from Changesets CLI](https://github.com/knope-dev/changesets#change-file-format)
- [Official Nub action input definitions](https://github.com/nubjs/setup-nub/blob/v0/action.yml)
- [Official checkout v6 definition](https://github.com/actions/checkout/blob/v6/action.yml)
- [Official setup-node v6 definition](https://github.com/actions/setup-node/blob/v6/action.yml)
