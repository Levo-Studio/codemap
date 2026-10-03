// SPDX-License-Identifier: Apache-2.0

// The licences named in CONTRIBUTING.md: permissive ones that can ship inside
// an Apache-2.0 package without imposing their own terms on it. Anything else
// is a question for the owner before it is added here. 0BSD is the BSD licence
// without the attribution clause, so it is counted among the BSD licences.
export const ALLOWED = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
]);

// Development tools are never shipped, so their licence terms never reach a
// user of Codemap. MPL-2.0 is file-level copyleft and is accepted there only:
// Vite, which vitest and the web build use, depends on lightningcss under it.
export const ALLOWED_FOR_DEVELOPMENT = new Set([...ALLOWED, "MPL-2.0"]);

// Named exceptions for shipped packages, each with its reason. elkjs, the
// layered layout engine, is offered under EPL-2.0 or GPL-3.0; EPL-2.0 is
// file-level copyleft and allows shipping it unchanged inside an Apache-2.0
// package. The exception is for elkjs only, and only in its EPL form.
const EXCEPTIONS = new Map([["elkjs", "EPL-2.0"]]);

// OFL is a font licence and is only accepted for font packages. Fontsource is
// where OFL fonts come from on npm; another source is added here by hand.
const FONT_ONLY = "OFL-1.1";
/** @param {string} name */
const isFontPackage = (name) => name.startsWith("@fontsource/");

// One allowed side of an OR is enough, every side of an AND has to be allowed.
// Brackets inside the expression and WITH clauses are not unpicked; they fail
// and are looked at by hand, which is the safe direction to be wrong in.
/**
 * @param {string} expression
 * @param {Set<string>} [allowed]
 * @param {string} [packageName]
 */
export function isAllowed(expression, allowed = ALLOWED, packageName = "") {
  /** @param {string} id */
  const permits = (id) =>
    allowed.has(id) ||
    (id === FONT_ONLY && isFontPackage(packageName)) ||
    EXCEPTIONS.get(packageName) === id;
  const text = expression.trim().replace(/^\((.*)\)$/, "$1");
  if (text === "" || text.includes("(") || text.includes(" WITH ")) return false;
  if (text.includes(" AND ") && text.includes(" OR ")) return false;
  if (text.includes(" AND ")) return text.split(" AND ").every((id) => permits(id.trim()));
  return text.split(" OR ").some((id) => permits(id.trim()));
}

/** @typedef {Record<string, { name: string, versions: string[] }[]>} Report */
/** @typedef {{ name: string, version: string, license: string }} Violation */

// `pnpm licenses list --json` groups packages by licence expression.
/**
 * @param {Report} report
 * @param {Set<string>} [allowed]
 * @returns {Violation[]}
 */
export function findViolations(report, allowed = ALLOWED) {
  /** @type {Violation[]} */
  const violations = [];
  for (const [license, packages] of Object.entries(report)) {
    for (const pkg of packages) {
      if (isAllowed(license, allowed, pkg.name)) continue;
      for (const version of pkg.versions) violations.push({ name: pkg.name, version, license });
    }
  }
  return violations;
}

// pnpm prints this sentence instead of JSON when a selection has no packages.
// Any other output that is not JSON is an error, never an empty report, so a
// warning or a changed format cannot turn the check green.
const NO_PACKAGES = "No licenses in packages found";

/**
 * @param {string} output
 * @returns {Report}
 */
export function parseReport(output) {
  const text = output.trim();
  if (text === NO_PACKAGES) return {};
  return JSON.parse(text);
}
