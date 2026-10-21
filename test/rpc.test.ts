import assert from "node:assert/strict";
import test from "node:test";

import { createMessageReader, encodeMessage } from "../src/rpc.ts";

function collect(): { messages: unknown[]; read: (chunk: Buffer) => void } {
  const messages: unknown[] = [];
  return {
    messages,
    read: createMessageReader((payload) => messages.push(JSON.parse(payload))),
  };
}

test("reads a frame split across chunks, including inside a multi-byte character", () => {
  const { messages, read } = collect();
  const frame = encodeMessage({ text: "😀 é" });
  for (let i = 0; i < frame.length; i++) {
    read(frame.subarray(i, i + 1));
  }
  assert.deepEqual(messages, [{ text: "😀 é" }]);
});

test("reads several frames from one chunk", () => {
  const { messages, read } = collect();
  read(
    Buffer.concat([
      encodeMessage({ id: 1 }),
      encodeMessage({ id: 2 }),
      encodeMessage({ id: 3 }),
    ])
  );
  assert.deepEqual(messages, [{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test("Content-Length counts bytes, not characters", () => {
  const frame = encodeMessage("😀").toString("utf-8");
  assert.match(frame, /^Content-Length: 6\r\n\r\n"😀"$/);
});

test("rejects a frame without Content-Length", () => {
  const { read } = collect();
  assert.throws(
    () => read(Buffer.from("X-Other: 1\r\n\r\n{}")),
    /Missing Content-Length/
  );
});
