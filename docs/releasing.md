# Release notes for contributors

Include a `.changeset/*.md` file in PRs that need an npm release. Skip it for documentation or internal changes that do not need publishing.

After installing dependencies, run this from the repository root:

```sh
nub run changeset
```

You can also create a file such as `.changeset/fix-diagnostics.md` with this content. No extra tools required:

```markdown
---
"json-const-content-mapper": patch
---

Correct JSON diagnostic locations.
```

Choose `patch` for fixes, `minor` for new features, or `major` for breaking changes. Describe the change for users.

Include a change file for mapper output changes. TypeScript caches results by package version.

Commit the change file with your code. Leave `package.json` versions and `CHANGELOG.md` to the release automation. Maintainers handle publishing.
