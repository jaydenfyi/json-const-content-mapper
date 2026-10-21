import spec from "./petstore.const.json" with { type: "json" };

// The spec is the contract: paths, methods and parameter names become literal types,
// so a typo in a hand-written client fails to compile instead of sending a bad request.
type Paths = typeof spec.paths;

export type Path = keyof Paths; // "/pets" | "/pets/{id}"
export type Method<P extends Path> = keyof Paths[P]; // "get" | "post"

type Operation<P extends Path, M extends Method<P>> = Paths[P][M];
type ParametersOf<T> = T extends { parameters: readonly (infer P)[] }
  ? P
  : never;
type NameOf<T> = T extends { name: infer N extends string } ? N : never;

export type ParamName<P extends Path, M extends Method<P>> = NameOf<
  ParametersOf<Operation<P, M>>
>;
// ParamName<"/pets", "get"> = "limit"

// What a generated client's signature can now look like:
export declare function request<P extends Path, M extends Method<P>>(
  path: P,
  method: M,
  params: Partial<Record<ParamName<P, M>, string>>
): Promise<unknown>;

export const ok = request("/pets", "get", { limit: "10" });

// Expected errors:
export const badPath = request("/pet", "get", {}); // "/pet" is not assignable to "/pets" | "/pets/{id}"
export const badMethod = request("/pets", "put", {}); // "put" is not assignable to "get" | "post"
export const badParam = request("/pets", "get", { offset: "10" }); // "offset" is not in keyof the spec's parameter names
