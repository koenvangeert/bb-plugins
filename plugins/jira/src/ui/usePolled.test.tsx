// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePolled } from "./usePolled";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe("usePolled", () => {
  it("ignores a response that a newer request overtook", async () => {
    const first = deferred<string>();
    const responses = [first.promise, Promise.resolve("new")];
    const load = () => responses.shift()!;
    const { result } = renderHook(() => usePolled(load));

    await result.current.refresh();
    await waitFor(() => expect(result.current.value).toBe("new"));
    first.resolve("old");
    await first.promise;
    await new Promise((done) => setTimeout(done, 20));

    expect(result.current.value).toBe("new");
  });

  it("ignores a poll that was running when a value was set", async () => {
    const poll = deferred<string>();
    const load = () => poll.promise;
    const { result } = renderHook(() => usePolled(load));

    result.current.set("from refresh");
    await waitFor(() => expect(result.current.value).toBe("from refresh"));
    poll.resolve("stale");
    await poll.promise;
    await new Promise((done) => setTimeout(done, 20));

    expect(result.current.value).toBe("from refresh");
  });

  it("clears the old value when the loader changes", async () => {
    const { result, rerender } = renderHook(({ load }) => usePolled(load), {
      initialProps: { load: () => Promise.resolve("thread 1") },
    });
    await waitFor(() => expect(result.current.value).toBe("thread 1"));
    const pending = deferred<string>();

    rerender({ load: () => pending.promise });

    expect(result.current.value).toBeNull();
  });
});
