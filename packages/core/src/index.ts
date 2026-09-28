// SPDX-License-Identifier: Apache-2.0

export { type ActivityOptions, timeline, withActivity } from "./activity.js";
export {
  type AnalyseOptions,
  type Analysis,
  analyse,
  type Phase,
  type PhaseReport,
} from "./analyse.js";
export { type Answer, ask, withAnswer } from "./ask.js";
export {
  type Cache,
  cacheDirectory,
  contentHash,
  type Explanation,
  type ExplanationStore,
  openCache,
  schemaVersion,
} from "./cache.js";
export {
  containerPadding,
  live,
  loadingGhosts,
  margin,
  phaseWeight,
  size,
  spacing,
} from "./design.js";
export {
  type Explained,
  Explainer,
  type ExplainProgress,
  readAnswer,
} from "./explain.js";
export {
  type Language,
  type LanguageId,
  languageOf,
  languages,
  type SupportTier,
} from "./languages.js";
export { type Layout, type LayoutEdge, type LayoutNode, layout } from "./layout.js";
export { type LiveOptions, type LiveProject, startLive } from "./live.js";
export { codeOf, plainText, richText, type SourceReader, type Words } from "./panels.js";
export {
  type Call,
  type CodeSymbol,
  type FileFacts,
  type Import,
  parse,
  type SymbolKind,
} from "./parse.js";
export {
  anthropicProvider,
  type Completion,
  claudeProvider,
  defaultModels,
  type Effort,
  ollamaProvider,
  type Provider,
  ProviderError,
  type ProviderKind,
} from "./providers.js";
export { createResolver, packageName, type Resolver, type Target } from "./resolve.js";
export { defaultIgnoredPaths, type ScanProgress, type SourceFile, scan } from "./scan.js";
export { search } from "./search.js";
export { type Service, serviceOf } from "./services.js";
export { type Arrival, type FileChange, Session } from "./session.js";
export { emptyScreen, loadingScreen } from "./states.js";
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
export {
  type BuildOptions,
  buildMap,
  type LayoutStore,
  type Place,
  type Project,
} from "./views.js";
export {
  type ChangeBatch,
  type Watching,
  type WatchOptions,
  watch,
  watchEarly,
} from "./watch.js";
