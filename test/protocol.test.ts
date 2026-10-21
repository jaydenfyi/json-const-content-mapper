import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createMessageReader, encodeMessage } from "../src/rpc.ts";

// Drives the built server (dist/), which is what TypeScript runs. `nub run test` builds first.
const serverPath = fileURLToPath(new URL("../dist/server.js", import.meta.url));

// A reply carries exactly one of result/error; a test reads the one it expects, and names
// the result shape it asserts on.
interface RpcReply<TResult = unknown> {
  error: { code: number; message: string };
  id: number;
  jsonrpc: "2.0";
  result: TResult;
}

function startServer(
  t: test.TestContext
): <TResult = unknown>(
  method: string,
  params?: unknown
) => Promise<RpcReply<TResult>> {
  const child = spawn(process.execPath, [serverPath], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
  });
  const pending = new Map<number, (message: unknown) => void>();
  child.stdout.on(
    "data",
    createMessageReader((payload) => {
      const message = JSON.parse(payload);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    })
  );
  let nextId = 1;
  return <TResult>(
    method: string,
    params?: unknown
  ): Promise<RpcReply<TResult>> => {
    const id = nextId;
    nextId += 1;
    // There is no other way to await a pending JSON-RPC reply.
    // oxlint-disable-next-line promise/avoid-new
    const response = new Promise<RpcReply<TResult>>((resolve) => {
      // The wire reply is whatever the server sends; the caller names the shape it expects.
      pending.set(id, resolve as (message: unknown) => void);
    });
    child.stdin.write(
      encodeMessage({
        id,
        jsonrpc: "2.0",
        method,
        ...(params !== undefined && { params }),
      })
    );
    return response;
  };
}

function project(projectHandle: string, extra: object = {}) {
  return {
    compilerOptions: {},
    configFileName: "/p/tsconfig.json",
    projectHandle,
    ...extra,
  };
}

test("serves the full lifecycle", async (t) => {
  const request = startServer(t);

  assert.deepEqual(
    await request("initialize", { positionEncodings: ["utf-8", "utf-16"] }),
    {
      id: 1,
      jsonrpc: "2.0",
      result: { diagnosticSource: "json-const", positionEncoding: "utf-16" },
    }
  );
  const opened = await request("openProject", project("p1"));
  assert.deepEqual(opened.result, {});

  const transformed = await request("transform", {
    content: "[1]\n",
    fileName: "/p/a.const.json",
    projectHandle: "p1",
  });
  assert.deepEqual(transformed.result, {
    extension: ".ts",
    mappings: [[16, 4, 0, 4, 0]],
    text: "export default ([1]\n) as const;\n",
  });

  const closed = await request("closeProject", { projectHandle: "p1" });
  assert.equal(closed.result, null);
});

test("treats .jsonc files as JSONC", async (t) => {
  const request = startServer(t);
  await request("initialize", { positionEncodings: ["utf-16"] });
  await request("openProject", project("p"));
  const content = "[1, // one\n]";
  const jsonc = await request<{ diagnostics?: unknown }>("transform", {
    content,
    fileName: "/p/a.jsonc",
    projectHandle: "p",
  });
  assert.equal(jsonc.result.diagnostics, undefined);
  const json = await request<{ diagnostics: { code: number }[] }>("transform", {
    content,
    fileName: "/p/a.const.json",
    projectHandle: "p",
  });
  assert.equal(json.result.diagnostics[0].code, 1004);
});

test("echoes protocolVersion when the host sends one", async (t) => {
  const request = startServer(t);
  const response = await request<{ protocolVersion?: number }>("initialize", {
    positionEncodings: ["utf-16"],
    protocolVersion: 1,
  });
  assert.equal(response.result.protocolVersion, 1);
});

test("rejects a host that does not offer utf-16", async (t) => {
  const request = startServer(t);
  const response = await request("initialize", {
    positionEncodings: ["utf-8"],
  });
  assert.equal(response.error.code, -32_602);
});

test("reports options as unsupported", async (t) => {
  const request = startServer(t);
  await request("initialize", { positionEncodings: ["utf-16"] });
  const response = await request<{ optionDiagnostics: unknown[] }>(
    "openProject",
    project("p", { options: { namedExports: true } })
  );
  assert.deepEqual(response.result.optionDiagnostics, [
    {
      code: 2001,
      messageText: "json-const-content-mapper does not accept any options.",
      path: [],
    },
  ]);
});

test("returns JSON-RPC errors for bad requests", async (t) => {
  const request = startServer(t);
  await request("initialize", { positionEncodings: ["utf-16"] });
  const unknownMethod = await request("bogus");
  assert.equal(unknownMethod.error.code, -32_601);

  const missingParams = await request("initialize");
  assert.equal(missingParams.error.code, -32_602);

  const badParams = await request("transform", { fileName: 1 });
  assert.equal(badParams.error.code, -32_602);

  const badHandle = await request("openProject", { projectHandle: "x" });
  assert.equal(badHandle.error.code, -32_602);
});
