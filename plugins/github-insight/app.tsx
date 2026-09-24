import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ComposerBanner } from "./ui/composer-banner";
import { PrTab } from "./ui/pr-tab";
import { ReviewTab } from "./ui/review-tab";

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: "pr",
    title: "PR",
    layout: "padded",
    component: PrTab,
  });
  app.slots.threadPanelAction({
    id: "review",
    title: "Review",
    layout: "flush",
    component: ReviewTab,
  });
  app.composer.customize({
    id: "pr-insight",
    scopes: ["thread"],
    banners: [{ id: "merge-blockers", component: ComposerBanner }],
  });
});
