// SPDX-License-Identifier: Apache-2.0

// The languages Codemap reads, and how well. The support tier is shown in the
// interface as it is: a language is not presented as understood better than
// the analysis understands it.

export type LanguageId = "typescript" | "tsx" | "javascript" | "python" | "go";

// full: imports resolved precisely and calls matched within the project.
// structure: files, symbols and imports; calls matched by name only.
export type SupportTier = "full" | "structure";

export interface Language {
  id: LanguageId;
  extensions: readonly string[];
  tier: SupportTier;
}

export const languages: readonly Language[] = [
  { id: "typescript", extensions: [".ts", ".mts", ".cts"], tier: "full" },
  { id: "tsx", extensions: [".tsx"], tier: "full" },
  { id: "javascript", extensions: [".js", ".mjs", ".cjs", ".jsx"], tier: "full" },
  { id: "python", extensions: [".py"], tier: "structure" },
  { id: "go", extensions: [".go"], tier: "structure" },
];

// Declaration files describe code that lives elsewhere; they have no
// behaviour to map.
const skipped = [".d.ts", ".d.mts", ".d.cts"];

export function languageOf(path: string): Language | undefined {
  if (skipped.some((suffix) => path.endsWith(suffix))) return undefined;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return undefined;
  const extension = path.slice(dot);
  return languages.find((language) => language.extensions.includes(extension));
}
