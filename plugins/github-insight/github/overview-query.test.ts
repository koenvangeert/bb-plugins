import { describe, expect, it } from "vitest";
import { overviewPageArgs } from "./overview-query";

const pr = { owner: "collibra", repo: "frontend", number: 25337 };

describe("overviewPageArgs", () => {
  it("asks the review state only on the first page", () => {
    expect(overviewPageArgs({ ...pr, after: null })).toContain("firstPage=true");
    expect(overviewPageArgs({ ...pr, after: "MTAw" })).toEqual(
      expect.arrayContaining(["firstPage=false", "after=MTAw"]),
    );
  });
});
