import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ThreadTicket } from "./src/ui/ThreadTicket";
import { TicketsPage } from "./src/ui/TicketsPage";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "jira",
    title: "Jira",
    icon: "jira/jira",
    path: "jira",
    component: TicketsPage,
  });
  app.slots.experimental_threadHeaderAction({
    id: "thread-ticket",
    title: "Jira ticket",
    component: ThreadTicket,
  });
});
