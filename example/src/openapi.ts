import spec from "./petstore.const.json" with { type: "json" };

// The spec is the contract: paths, methods and parameter names become literal types,
// so a typo in a hand-written client fails to compile instead of sending a bad request.
type Paths = typeof spec.paths;

export type Path = keyof Paths; // "/pets" | "/pets/{id}"
export type Method<TPath extends Path> = keyof Paths[TPath]; // "get" | "post"

type Operation<
  TPath extends Path,
  TMethod extends Method<TPath>,
> = Paths[TPath][TMethod];
type ParametersOf<TOperation> = TOperation extends {
  parameters: readonly (infer TParameter)[];
}
  ? TParameter
  : never;
type NameOf<TParameter> = TParameter extends {
  name: infer TName extends string;
}
  ? TName
  : never;

export type ParamName<
  TPath extends Path,
  TMethod extends Method<TPath>,
> = NameOf<ParametersOf<Operation<TPath, TMethod>>>;
// ParamName<"/pets", "get"> = "limit"

// What a generated client's signature can now look like:
export declare function request<
  TPath extends Path,
  TMethod extends Method<TPath>,
>(
  path: TPath,
  method: TMethod,
  params: Partial<Record<ParamName<TPath, TMethod>, string>>
): Promise<unknown>;

export const ok = request("/pets", "get", { limit: "10" });

// Expected errors:
export const badPath = request("/pet", "get", {}); // "/pet" is not assignable to "/pets" | "/pets/{id}"
export const badMethod = request("/pets", "put", {}); // "put" is not assignable to "get" | "post"
export const badParam = request("/pets", "get", { offset: "10" }); // "offset" is not in keyof the spec's parameter names
