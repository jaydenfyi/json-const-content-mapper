# Release notes for contributors

Include a `.changeset/*.md` file in PRs that need an npm release. Skip it for documentation or internal changes that do not need publishing.

Create one with [Knope 0.23.1](https://github.com/knope-dev/knope/releases/tag/knope/v0.23.1):

```sh
knope document-change
```

Or write the file yourself:

```markdown
---
default: patch
---

Correct JSON diagnostic locations.
```

Choose `patch` for fixes, `minor` for new features, or `major` for breaking changes. Describe the change for users.

Include a change file for mapper output changes. TypeScript caches results by package version.

Commit the change file with your code. Leave `package.json` versions and `CHANGELOG.md` to the release automation. Maintainers handle publishing.
