import { describe, expect, it } from "vitest";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import { fileURLToPath } from "node:url";

describe("public SDK boundary", () => {
  it("imports no private BB packages or files outside this plugin", () => {
    const scan = experimental_scanPublicSdkOnly(fileURLToPath(new URL(".", import.meta.url)), {
      allow: [/^vitest$/],
    });
    expect(scan.files).toContain("server.ts");
    expect(scan.violations).toEqual([]);
    expect(scan.privateDependencies).toEqual([]);
  });
});
