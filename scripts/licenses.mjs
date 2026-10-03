// SPDX-License-Identifier: Apache-2.0

export const ALLOWED = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
]);

export const ALLOWED_FOR_DEVELOPMENT = new Set([...ALLOWED, "MPL-2.0"]);

const EXCEPTIONS = new Map([["elkjs", "EPL-2.0"]]);

const FONT_ONLY = "OFL-1.1";
/** @param {string} name */
const isFontPackage = (name) => name.startsWith("@fontsource/");

// Brackets and WITH fail safely, to be checked by hand.
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

const NO_PACKAGES = "No licenses in packages found";

// Other non-JSON output throws, so warnings cannot pass the check.
/**
 * @param {string} output
 * @returns {Report}
 */
export function parseReport(output) {
  const text = output.trim();
  if (text === NO_PACKAGES) return {};
  return JSON.parse(text);
}
