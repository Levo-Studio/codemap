// SPDX-License-Identifier: Apache-2.0

import { sep } from "node:path";

// A path as the project's paths are written on every system: with "/".
export const toPosix = (path: string) => path.split(sep).join("/");

// "lib/billing/invoices.ts" → "invoices.ts".
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
