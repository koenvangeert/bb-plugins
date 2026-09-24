import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { PrTab } from "./ui/pr-tab";

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: "pr",
    title: "PR",
    layout: "padded",
    component: PrTab,
  });
});
