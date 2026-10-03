// SPDX-License-Identifier: Apache-2.0

const top = new Set(["package.json", "LICENSE", "NOTICE", "README.md"]);
const folders = ["bundle/", "web/", "grammars/", "licenses/"];

// Sync copies ("bin 2.js") and source maps never ship.
/** @param {string} entry */
function allowed(entry) {
  const path = entry.replace(/^package\//, "");
  if (path.split("/").some((part) => / \d+(\.|$)/.test(part) || part.startsWith("."))) return false;
  if (path.endsWith(".map")) return false;
  return top.has(path) || folders.some((folder) => path.startsWith(folder));
}

/** @param {string[]} entries */
export const strays = (entries) => entries.filter((entry) => !allowed(entry));
