// SPDX-License-Identifier: Apache-2.0

import { sep } from "node:path";

export const toPosix = (path: string) => path.split(sep).join("/");

export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
