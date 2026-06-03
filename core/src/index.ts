// Public API barrel for @my-todo/core.
//
// Web and mobile may import from specific submodules (e.g.
// '../../core/src/persistence') for sharper tree-shaking, but new code
// should prefer this index export.

export * from "./types";
export * from "./utils";
export * from "./persistence";
export * from "./categories";
export * from "./profile";
export * from "./i18n";
export * from "./derive";
export * from "./groups";
export * from "./filters";
export * from "./store";
