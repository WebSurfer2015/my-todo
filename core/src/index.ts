// Public API barrel for @my-todo/core.
//
// Web and mobile may import from specific submodules (e.g.
// '../../core/src/persistence') for sharper tree-shaking, but new code
// should prefer this index export.

export * from "./domain/types";
export * from "./logic/utils";
export * from "./ports/persistence";
export * from "./data/categories";
export * from "./data/profile";
export * from "./data/i18n";
export * from "./logic/derive";
export * from "./logic/groups";
export * from "./logic/filters";
export * from "./store";
