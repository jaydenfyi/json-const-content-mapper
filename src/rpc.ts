// JSON-RPC message framing over stdio, using LSP-style Content-Length headers.

const headerSeparator = "\r\n\r\n";

/** Returns a chunk handler that buffers input and calls onMessage once per complete frame. */
export function createMessageReader(
  onMessage: (payload: string) => void
): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf(headerSeparator);
      if (headerEnd === -1) {
        return;
      }
      const header = buffer.subarray(0, headerEnd).toString("ascii");
      const match = /^Content-Length:\s*(?<length>\d+)\s*$/imu.exec(header);
      if (!match?.groups) {
        throw new Error("Missing Content-Length header");
      }
      const messageStart = headerEnd + headerSeparator.length;
      const messageEnd = messageStart + Number(match.groups.length);
      if (buffer.length < messageEnd) {
        return;
      }
      const payload = buffer
        .subarray(messageStart, messageEnd)
        .toString("utf-8");
      buffer = buffer.subarray(messageEnd);
      onMessage(payload);
    }
  };
}

export function encodeMessage(message: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(message), "utf-8");
  return Buffer.concat([
    Buffer.from(`Content-Length: ${payload.length}${headerSeparator}`, "ascii"),
    payload,
  ]);
}
