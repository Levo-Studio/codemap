// SPDX-License-Identifier: Apache-2.0

import { sep } from "node:path";

// The map writes every path with "/", whatever the system's separator is.
export const toPosix = (path: string) => path.split(sep).join("/");

// "lib/billing/invoices.ts" → "invoices.ts".
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
