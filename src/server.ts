#!/usr/bin/env node

// Content mapper process. TypeScript sends JSON-RPC requests over stdin and reads responses from stdout,
// so nothing but protocol frames may be written to stdout. The mapper keeps no per-project state: a
// transform depends only on the file's name and content.

import type {
  InitializeParams,
  InitializeResult,
  OpenProjectParams,
  OpenProjectResult,
  TransformParams,
} from "./protocol.ts";
import { createMessageReader, encodeMessage } from "./rpc.ts";
import { transform } from "./transform.ts";

// JSON-RPC 2.0 error codes.
const ParseError = -32_700;
const InvalidRequest = -32_600;
const MethodNotFound = -32_601;
const InvalidParams = -32_602;
const InternalError = -32_603;

const optionsNotSupportedCode = 2001;

interface JsonRpcRequest {
  id: string | number;
  method: string;
  params?: unknown;
}

class RpcError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInitializeParams(value: unknown): value is InitializeParams {
  return isRecord(value) && Array.isArray(value.positionEncodings);
}

function isOpenProjectParams(value: unknown): value is OpenProjectParams {
  return (
    isRecord(value) &&
    typeof value.configFileName === "string" &&
    typeof value.projectHandle === "string" &&
    isRecord(value.compilerOptions) &&
    (value.options === undefined || isRecord(value.options))
  );
}

function isTransformParams(value: unknown): value is TransformParams {
  return (
    isRecord(value) &&
    typeof value.fileName === "string" &&
    typeof value.content === "string" &&
    typeof value.projectHandle === "string"
  );
}

function isRequest(value: unknown): value is JsonRpcRequest {
  return (
    isRecord(value) &&
    value.jsonrpc === "2.0" &&
    (typeof value.id === "string" || typeof value.id === "number") &&
    typeof value.method === "string"
  );
}

function expectParams<TParams>(
  params: unknown,
  isValid: (value: unknown) => value is TParams,
  message: string
): TParams {
  if (!isValid(params)) {
    throw new RpcError(InvalidParams, message);
  }
  return params;
}

function writeMessage(message: unknown): void {
  process.stdout.write(encodeMessage(message));
}

function writeError(
  id: string | number | null,
  code: number,
  message: string
): void {
  writeMessage({ error: { code, message }, id, jsonrpc: "2.0" });
}

function initialize({
  protocolVersion,
  positionEncodings,
}: InitializeParams): InitializeResult {
  // Positions are UTF-16 so that JavaScript string indices can be used directly.
  if (!positionEncodings.includes("utf-16")) {
    throw new RpcError(
      InvalidParams,
      "json-const-content-mapper requires the utf-16 position encoding"
    );
  }
  return {
    ...(protocolVersion !== undefined && { protocolVersion }),
    diagnosticSource: "json-const",
    positionEncoding: "utf-16",
  };
}

function openProject({ options }: OpenProjectParams): OpenProjectResult {
  if (options && Object.keys(options).length > 0) {
    return {
      optionDiagnostics: [
        {
          code: optionsNotSupportedCode,
          messageText: "json-const-content-mapper does not accept any options.",
          path: [],
        },
      ],
    };
  }
  return {};
}

function dispatch(method: string, params: unknown): unknown {
  switch (method) {
    case "initialize": {
      return initialize(
        expectParams(
          params,
          isInitializeParams,
          "initialize requires a positionEncodings array"
        )
      );
    }
    case "openProject": {
      return openProject(
        expectParams(
          params,
          isOpenProjectParams,
          "openProject requires string configFileName and projectHandle and an object compilerOptions"
        )
      );
    }
    case "transform": {
      const { fileName, content } = expectParams(
        params,
        isTransformParams,
        "transform requires string fileName, content and projectHandle"
      );
      return transform(fileName, content);
    }
    case "closeProject": {
      return null;
    }
    default: {
      throw new RpcError(MethodNotFound, `Method not found: ${method}`);
    }
  }
}

function handleMessage(payload: string): void {
  let request: unknown;
  try {
    request = JSON.parse(payload);
  } catch {
    writeError(null, ParseError, "Parse error");
    return;
  }
  if (!isRequest(request)) {
    writeError(null, InvalidRequest, "Invalid request");
    return;
  }
  try {
    writeMessage({
      id: request.id,
      jsonrpc: "2.0",
      result: dispatch(request.method, request.params),
    });
  } catch (error) {
    const code = error instanceof RpcError ? error.code : InternalError;
    writeError(
      request.id,
      code,
      error instanceof Error ? error.message : String(error)
    );
  }
}

process.stdin.on("data", createMessageReader(handleMessage));
