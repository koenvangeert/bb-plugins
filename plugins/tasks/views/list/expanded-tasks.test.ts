// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { makeTask } from "../../test-fixtures.js";
import {
  EXPANDED_TASKS_STORAGE_KEY,
  EXPANDED_TASKS_VERSION,
  loadExpandedTasks,
  storeExpandedTasks,
  useExpandedTasks,
} from "./expanded-tasks.js";
import type { ListTreeEntry } from "./lib.js";

beforeEach(() => {
  window.localStorage.clear();
});

function entry(id: string, autoExpand = false): ListTreeEntry {
  return {
    task: makeTask({ id }),
    dimmed: false,
    children: [],
    subDone: 0,
    subTotal: 1,
    autoExpand,
  };
}

describe("expanded task storage", () => {
  it("round-trips expanded ids per scope", () => {
    storeExpandedTasks(
      "project:A",
      new Set(["T1", "T2"]),
      new Set(["T1", "T2"]),
    );
    storeExpandedTasks("all", new Set(["T3"]), new Set(["T3"]));

    expect(loadExpandedTasks("project:A")).toEqual(new Set(["T1", "T2"]));
    expect(loadExpandedTasks("all")).toEqual(new Set(["T3"]));
    expect(
      JSON.parse(window.localStorage.getItem(EXPANDED_TASKS_STORAGE_KEY)!),
    ).toMatchObject({ version: EXPANDED_TASKS_VERSION });
  });

  it("loads an empty set from bad stored JSON", () => {
    window.localStorage.setItem(EXPANDED_TASKS_STORAGE_KEY, "{not json");
    expect(loadExpandedTasks("all")).toEqual(new Set());

    window.localStorage.setItem(
      EXPANDED_TASKS_STORAGE_KEY,
      JSON.stringify({ version: 1, scopes: { all: [1, "T1", null] } }),
    );
    expect(loadExpandedTasks("all")).toEqual(new Set(["T1"]));
  });

  it("drops ids that are not in scope when it writes", () => {
    storeExpandedTasks("all", new Set(["T1", "GONE"]), new Set(["T1"]));
    expect(loadExpandedTasks("all")).toEqual(new Set(["T1"]));
  });

  it("does not overwrite a document from a newer version", () => {
    const future = JSON.stringify({ version: 99, scopes: {} });
    window.localStorage.setItem(EXPANDED_TASKS_STORAGE_KEY, future);
    storeExpandedTasks("all", new Set(["T1"]), new Set(["T1"]));
    expect(window.localStorage.getItem(EXPANDED_TASKS_STORAGE_KEY)).toBe(
      future,
    );
  });
});

describe("useExpandedTasks", () => {
  const known = new Set(["T1", "T2"]);

  it("is collapsed by default and saves toggles without a filter", () => {
    const { result } = renderHook(() => useExpandedTasks("all", null, known));
    expect(result.current.isExpanded(entry("T1"))).toBe(false);

    act(() => result.current.toggle(entry("T1")));

    expect(result.current.isExpanded(entry("T1"))).toBe(true);
    expect(loadExpandedTasks("all")).toEqual(new Set(["T1"]));
  });

  it("uses autoExpand under a filter and does not change the saved set on toggle", () => {
    storeExpandedTasks("all", new Set(["T2"]), known);
    const { result, rerender } = renderHook(
      ({ filterKey }: { filterKey: string | null }) =>
        useExpandedTasks("all", filterKey, known),
      { initialProps: { filterKey: "blocked" as string | null } },
    );
    expect(result.current.isExpanded(entry("T1", true))).toBe(true);
    expect(result.current.isExpanded(entry("T2"))).toBe(false);

    act(() => result.current.toggle(entry("T1", true)));

    expect(result.current.isExpanded(entry("T1", true))).toBe(false);
    expect(loadExpandedTasks("all")).toEqual(new Set(["T2"]));

    rerender({ filterKey: null });
    expect(result.current.isExpanded(entry("T1", true))).toBe(false);
    expect(result.current.isExpanded(entry("T2"))).toBe(true);

    rerender({ filterKey: "blocked" });
    expect(result.current.isExpanded(entry("T1", true))).toBe(true);
  });
});
