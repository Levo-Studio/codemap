// SPDX-License-Identifier: Apache-2.0

export { type ActivityOptions, timeline, withActivity } from "./activity.js";
export {
  type AnalyseOptions,
  type Analysis,
  analyse,
  type Phase,
  type PhaseReport,
} from "./analyse.js";
export { type Cache, cacheDirectory, contentHash, openCache, schemaVersion } from "./cache.js";
export { containerPadding, live, margin, size, spacing } from "./design.js";
export {
  type Language,
  type LanguageId,
  languageOf,
  languages,
  type SupportTier,
} from "./languages.js";
export { type Layout, type LayoutEdge, type LayoutNode, layout } from "./layout.js";
export {
  type Call,
  type CodeSymbol,
  type FileFacts,
  type Import,
  parse,
  type SymbolKind,
} from "./parse.js";
export { createResolver, packageName, type Resolver, type Target } from "./resolve.js";
export { defaultIgnoredPaths, type ScanProgress, type SourceFile, scan } from "./scan.js";
export { type Service, serviceOf } from "./services.js";
export { type Arrival, type FileChange, Session } from "./session.js";
export {
  type Area,
  type Column,
  columnOf,
  type External,
  humanize,
  type Module,
  placement,
  type Structure,
  structure,
} from "./structure.js";
export { buildMap, type LayoutStore, type Place, type Project } from "./views.js";
export { type ChangeBatch, type Watching, type WatchOptions, watch } from "./watch.js";
