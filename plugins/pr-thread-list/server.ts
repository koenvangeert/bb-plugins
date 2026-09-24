import type { BbPluginApi } from "@get-bb/plugin-sdk";

// BB requires a server entry; this plugin only contributes frontend UI.
export default function plugin(_bb: BbPluginApi): void {}
