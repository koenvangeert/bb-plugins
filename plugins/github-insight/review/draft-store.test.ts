import type { PluginKvStorage } from "@get-bb/plugin-sdk";
import { describe, expect, it } from "vitest";
import type { Draft } from "../core/drafts";
import type { ReviewThread } from "../core/review-threads";
import { createDraftStore } from "./draft-store";

function fakeKv(rows: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(rows));
  const kv: PluginKvStorage = {
    get: async <T>(key: string) => data.get(key) as T | undefined,
    set: async (key, value) => {
      data.set(key, value);
    },
    delete: async (key) => {
      data.delete(key);
    },
    list: async (prefix = "") => [...data.keys()].filter((key) => key.startsWith(prefix)),
  };
  return { kv, data };
}

function thread(id: string, resolved = false): ReviewThread {
  return {
    id,
    resolved,
    outdated: false,
    path: "a.ts",
    line: 1,
    originalLine: 1,
    side: "RIGHT",
    comments: [],
    hasMoreComments: false,
  };
}

function allThreads(...threads: ReviewThread[]) {
  return { threads, complete: true };
}

const pr = { owner: "collibra", repo: "frontend", number: 25259 };
const otherPr = { owner: "collibra", repo: "frontend", number: 1 };
const draft: Draft = { body: "Renamed in abc123", updatedAt: 1, source: "agent" };

describe("draft store", () => {
  it("keys a draft by PR and review thread", async () => {
    const { kv, data } = fakeKv();

    await createDraftStore(kv).save(pr, "PRRT_a", draft);

    expect(Object.fromEntries(data)).toEqual({ "draft:collibra/frontend#25259:PRRT_a": draft });
  });

  it("replaces the old draft of the same thread", async () => {
    const { kv } = fakeKv();
    const store = createDraftStore(kv);

    await store.save(pr, "PRRT_a", draft);
    await store.save(pr, "PRRT_a", { ...draft, body: "Second", updatedAt: 2 });

    expect(await store.liveDrafts(pr, allThreads(thread("PRRT_a")))).toEqual({
      PRRT_a: { ...draft, body: "Second", updatedAt: 2 },
    });
  });

  it("returns only the drafts of the given PR", async () => {
    const { kv } = fakeKv();
    const store = createDraftStore(kv);
    await store.save(pr, "PRRT_a", draft);
    await store.save(otherPr, "PRRT_b", draft);

    expect(await store.liveDrafts(pr, allThreads(thread("PRRT_a"), thread("PRRT_b")))).toEqual({
      PRRT_a: draft,
    });
  });

  it("deletes the drafts of resolved and missing threads", async () => {
    const { kv, data } = fakeKv();
    const store = createDraftStore(kv);
    await store.save(pr, "PRRT_open", draft);
    await store.save(pr, "PRRT_resolved", draft);
    await store.save(pr, "PRRT_gone", draft);

    const drafts = await store.liveDrafts(pr, allThreads(thread("PRRT_open"), thread("PRRT_resolved", true)));

    expect(drafts).toEqual({ PRRT_open: draft });
    expect([...data.keys()]).toEqual(["draft:collibra/frontend#25259:PRRT_open"]);
  });

  it("keeps the draft of a thread past the read pages, without returning it", async () => {
    const { kv, data } = fakeKv();
    const store = createDraftStore(kv);
    await store.save(pr, "PRRT_resolved", draft);
    await store.save(pr, "PRRT_unread", draft);

    const drafts = await store.liveDrafts(pr, { threads: [thread("PRRT_resolved", true)], complete: false });

    expect(drafts).toEqual({});
    expect([...data.keys()]).toEqual(["draft:collibra/frontend#25259:PRRT_unread"]);
  });

  it("does not match a PR whose number starts with the same digits", async () => {
    const { kv } = fakeKv();
    const store = createDraftStore(kv);
    await store.save({ ...pr, number: 252590 }, "PRRT_a", draft);

    expect(await store.liveDrafts(pr, allThreads(thread("PRRT_a")))).toEqual({});
  });

  it("deletes a row that is not a draft", async () => {
    const { kv, data } = fakeKv({ "draft:collibra/frontend#25259:PRRT_a": { body: 3 } });

    expect(await createDraftStore(kv).liveDrafts(pr, allThreads(thread("PRRT_a")))).toEqual({});
    expect(data.size).toBe(0);
  });
});
