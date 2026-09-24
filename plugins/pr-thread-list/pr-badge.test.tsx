// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import { PrBadgeView } from "./pr-badge";

const pr: PluginSidebarPullRequest = {
  number: 42, title: "Ship it", url: "https://example.com/pull/42", state: "open", attention: "checks_pending",
};

describe("PR badge view", () => {
  it("makes no claim while loading or without a PR, then updates from host facts", () => {
    const view = render(<PrBadgeView isLoading pullRequest={pr} />);
    expect(view.queryByRole("link")).toBeNull();
    view.rerender(<PrBadgeView isLoading={false} pullRequest={null} />);
    expect(view.queryByRole("link")).toBeNull();
    view.rerender(<PrBadgeView isLoading={false} pullRequest={pr} />);
    expect(view.getByRole("link", { name: "PR #42: checks pending" })).toBeTruthy();
    view.rerender(<PrBadgeView isLoading={false} pullRequest={{ ...pr, attention: "ready_to_merge" }} />);
    expect(view.getByRole("link", { name: "PR #42: ready to merge" })).toBeTruthy();
  });
});
