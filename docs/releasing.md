# Releasing

## Current state

Repository: [jaydenfyi/json-const-content-mapper](https://github.com/jaydenfyi/json-const-content-mapper).
It starts **private**, with repository variable `RELEASES_ENABLED=false`.
Both release workflows require that variable to be `true` **and** the repository to be public.
CI runs while private. No workflow makes the repository public or performs the first npm publish.

## Document a change

Install [Knope 0.23.1](https://github.com/knope-dev/knope/releases/tag/knope/v0.23.1), then:

```sh
knope document-change
```

Commit the generated `.changeset/*.md` with the implementation. Or write it manually:

```markdown
---
default: patch
---

Correct JSON diagnostic locations.
```

Use `patch`, `minor`, or `major` for the intended version change. Commit messages do not affect releases.
Skip change files for documentation-only or internal changes that do not need publishing.
Do not bump `package.json` manually for subsequent releases: Knope does it in the release PR.
In particular, mapper output changes need a release because TypeScript caches by package version.

## One-time activation (only when ready to go public)

Keep `RELEASES_ENABLED=false` until all these steps are complete.

1. Review tracked files and repository history before changing visibility. Make the repository public
   deliberately through GitHub settings; **npm packages from this project are public too**.
2. Verify npm package-name availability and account access. From the reviewed, committed initial
   `0.1.0` source, run:

   ```sh
   nub install --frozen-lockfile
   nub run test
   nub run typecheck
   npm pack --dry-run
   npm login
   npm publish --access public
   ```

   This is a real public publication. Use interactive npm authentication/2FA, not a CI npm token.
   Only after confirming success, tag the exact published commit and push that tag:

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

   If the manifest version has changed before bootstrap, use that version consistently instead.
3. In the npm package's **Settings → Trusted Publisher**, configure GitHub Actions:
   owner `jaydenfyi`, repository `json-const-content-mapper`, workflow filename `release.yml`.
   Leave environment blank (this workflow does not use one) and explicitly allow direct
   `npm publish`, not just staged publishing. No `NPM_TOKEN` or `NODE_AUTH_TOKEN` is needed.
   New configurations must complete a successful publish within two days; configure this
   when the next release is ready. Node 24 + npm 11 in the workflow meet OIDC minimums.
4. Create a fine-grained GitHub PAT restricted to this repository, with **Contents: read/write**
   and **Pull requests: read/write**. Store it as repository Actions secret `RELEASE_PR_TOKEN`.
   A GitHub App installation token can replace it later. Never commit or paste the token into a command.
   The custom GitHub credential allows release-PR pushes to trigger normal CI checks;
   it is separate from npm's tokenless publishing.
5. Protect `main`: require pull requests, the `test` CI check, and an up-to-date branch before merge.
   Restrict writes to the reserved `release` branch to the automation credential.
   Do not merge a stale release PR while preparation is running.
6. Enable releases explicitly:

   ```sh
   gh variable set RELEASES_ENABLED --body true --repo jaydenfyi/json-const-content-mapper
   gh workflow run prepare-release.yml --ref main --repo jaydenfyi/json-const-content-mapper
   ```

   With no pending change files, preparation succeeds without creating a release PR.
   After the first successful OIDC publish, npm recommends disabling token-based publishing.

## Normal release

```text
PR with change file → merge into main → Knope updates release PR
                                         ↓ human reviews and merges
                         frozen install → tests → typecheck → package check
                                         ↓
                         GitHub release/tag → npm OIDC publish
```

Review version and changelog before merging. The release job checks out the exact merge commit and
revalidates it. It does not publish ordinary PRs or fork PRs. Keep publishing in this job:
a GitHub release/tag created with `GITHUB_TOKEN` does not trigger another release workflow.

The preparation workflow force-updates the reserved `release` branch, so do not use it for development.
`nub.lock` remains the dependency lock; Knope updates only `package.json` and `CHANGELOG.md`.

## Stop or recover

Set `RELEASES_ENABLED=false` to prevent new release jobs, and cancel any already-running release job
separately. This does not unpublish packages.

GitHub release creation and npm publishing are not atomic. If GitHub succeeds but npm fails, do not
blindly rerun the entire job: Knope may reject the existing GitHub release. Check the registry first.
For a missing npm version, check out the release's exact commit in a clean worktree, run the validation
commands above, and publish that version interactively with `npm login` / `npm publish --access public`.
This recovery publish does not have CI provenance. Never republish an existing npm version or delete a
successful tag to retry. Resolve the cause before the next normal release.

## References

- [Knope release PR recipe](https://knope.tech/recipes/1-preview-releases-with-pull-requests/)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [Research and configuration rationale](knope-release-research.md) (pre-implementation snapshot)
