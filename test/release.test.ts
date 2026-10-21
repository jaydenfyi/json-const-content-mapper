import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cli = path.join(root, "node_modules/@changesets/cli/bin.js");

test("creates a changeset and versions this single npm package", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "json-const-release-"));
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf-8")
    );
    mkdirSync(path.join(fixture, ".changeset"));
    copyFileSync(
      path.join(root, ".changeset/config.json"),
      path.join(fixture, ".changeset/config.json")
    );
    writeFileSync(
      path.join(fixture, "package.json"),
      JSON.stringify({
        name: manifest.name,
        version: "0.0.1",
      })
    );
    symlinkSync(
      path.join(root, "node_modules"),
      path.join(fixture, "node_modules"),
      "junction"
    );
    execFileSync("git", ["init", "--quiet"], { cwd: fixture });
    execFileSync("git", ["add", "package.json", ".changeset/config.json"], {
      cwd: fixture,
    });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Release Test",
        "-c",
        "user.email=release@example.com",
        "commit",
        "--quiet",
        "-m",
        "Initial fixture",
      ],
      { cwd: fixture }
    );

    execFileSync(
      process.execPath,
      [
        cli,
        "add",
        "--patch",
        manifest.name,
        "--message",
        "Correct JSON diagnostic locations.",
      ],
      { cwd: fixture }
    );
    const changes = readdirSync(path.join(fixture, ".changeset")).filter(
      (name) => name.endsWith(".md")
    );
    assert.equal(changes.length, 1);
    const [change] = changes;
    assert.ok(change);
    assert.match(
      readFileSync(path.join(fixture, ".changeset", change), "utf-8"),
      /json-const-content-mapper["']?: patch/u
    );
    execFileSync(process.execPath, [cli, "version"], { cwd: fixture });

    assert.equal(
      JSON.parse(readFileSync(path.join(fixture, "package.json"), "utf-8"))
        .version,
      "0.0.2"
    );
    assert.match(
      readFileSync(path.join(fixture, "CHANGELOG.md"), "utf-8"),
      /Correct JSON diagnostic locations\./u
    );
    assert.deepEqual(readdirSync(path.join(fixture, ".changeset")), [
      "config.json",
    ]);
  } finally {
    rmSync(fixture, { force: true, recursive: true });
  }
});
