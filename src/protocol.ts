// Content mapper protocol types, from microsoft/typescript-go#4712 and
// DanielRosenwasser/content-mapper-sample. Only the parts this mapper uses are included.

export type PositionEncoding = "utf-8" | "utf-16";

export interface InitializeParams {
    /** Sent by some TypeScript builds; echoed back when present. */
    protocolVersion?: number;
    positionEncodings: PositionEncoding[];
    locale?: string;
}

export interface InitializeResult {
    protocolVersion?: number;
    positionEncoding: PositionEncoding;
    diagnosticSource: string;
}

export interface OpenProjectParams {
    configFileName: string;
    projectHandle: string;
    options?: Record<string, unknown>;
    compilerOptions: Record<string, unknown>;
}

export interface OpenProjectResult {
    optionDiagnostics?: OptionDiagnostic[];
}

export interface OptionDiagnostic {
    path: (string | number)[];
    messageText: string;
    code: number;
}

export interface TransformParams {
    fileName: string;
    content: string;
    projectHandle: string;
}

export interface TransformResult {
    text: string;
    extension: ".ts";
    mappings?: SpanMapping[];
    diagnostics?: MapperDiagnostic[];
}

/** Positions and lengths are in the negotiated position encoding. */
export type SpanMapping = [
    virtualStart: number,
    virtualLength: number,
    originalStart: number,
    originalLength: number,
    kind: SpanMapKind,
];

export const SpanMapKind = {
    Verbatim: 0,
    Atom: 1,
    Alias: 2,
} as const;

export type SpanMapKind = (typeof SpanMapKind)[keyof typeof SpanMapKind];

export interface MapperDiagnostic {
    messageText: string;
    start: number;
    length: number;
    code: number;
}
