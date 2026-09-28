// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { serviceOf } from "./services.js";

describe("serviceOf", () => {
  it("knows which services hold the project's data or sign its users in", () => {
    expect(serviceOf("@prisma/client")).toMatchObject({ name: "Prisma", sensitive: true });
    expect(serviceOf("next-auth")).toMatchObject({ name: "Auth.js", sensitive: true });
    expect(serviceOf("stripe")).toMatchObject({ name: "Stripe", sensitive: false });
    expect(serviceOf("resend")).toMatchObject({ data: true, sensitive: false });
    expect(serviceOf("left-pad")).toBeUndefined();
  });
});
