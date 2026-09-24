import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ComposerBanner } from "./ui/composer-banner";
import { PrTab } from "./ui/pr-tab";

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: "pr",
    title: "PR",
    layout: "padded",
    component: PrTab,
  });
  app.composer.customize({
    id: "pr-insight",
    scopes: ["thread"],
    banners: [{ id: "merge-blockers", component: ComposerBanner }],
  });
});
