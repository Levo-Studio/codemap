// SPDX-License-Identifier: Apache-2.0

// What codemapkit may ship: the folders and files its manifest names, and in
// them nothing a file sync, a build or a run could leave beside the real
// files. A folder synced by the system gets copies named "bin 2.js"; a source
// map would carry paths of the machine that built it.

const top = new Set(["package.json", "LICENSE", "NOTICE", "README.md"]);
const folders = ["bundle/", "web/", "grammars/", "licenses/"];

/** @param {string} entry a path in the tarball, under package/ */
function allowed(entry) {
  const path = entry.replace(/^package\//, "");
  if (path.split("/").some((part) => / \d+(\.|$)/.test(part) || part.startsWith("."))) return false;
  if (path.endsWith(".map")) return false;
  return top.has(path) || folders.some((folder) => path.startsWith(folder));
}

/** @param {string[]} entries */
export const strays = (entries) => entries.filter((entry) => !allowed(entry));
