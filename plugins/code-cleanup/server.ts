import { PluginCliError, cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import { openProjectSettings } from "./project-settings";
import { defaultGuidance } from "./guidance";

const projectOption = {
  project: { type: "string", required: true, description: "Standard BB project ID" },
} as const;

export default function plugin(bb: BbPluginApi): void {
  const settings = openProjectSettings(bb);

  bb.agents.configure(({ project, origin }) => {
    if (project.kind !== "standard" || origin.pluginId === "side-chat") return { tools: [], skills: [] };
    const state = settings.get(project.id);
    if (!state.enabled) return { tools: [], skills: [] };
    return { tools: [], skills: [], instructions: state.prompt ?? defaultGuidance(project.id) };
  });

  async function requireStandardProject(projectId: string): Promise<void> {
    const projects = await bb.sdk.projects.list({ includePersonal: true });
    if (!projects.some((project) => project.id === projectId && project.kind === "standard")) {
      throw new PluginCliError(`No standard project with ID ${projectId}`, {
        code: "project_not_found",
        hint: "Use a standard project ID from `bb project list`.",
      });
    }
  }

  bb.cli.register(defineCli({
    name: "code-cleanup",
    summary: "Manage project-scoped Code Cleanup guidance",
    commands: {
      enable: cliCommand({
        summary: "Enable guidance for one project",
        options: projectOption,
        async run({ options }) {
          await requireStandardProject(options.project);
          settings.setEnabled(options.project, true);
          return { exitCode: 0, stdout: `Enabled Code Cleanup for ${options.project}.` };
        },
      }),
      disable: cliCommand({
        summary: "Disable guidance for one project (keep its prompt override)",
        options: projectOption,
        async run({ options }) {
          await requireStandardProject(options.project);
          settings.setEnabled(options.project, false);
          return { exitCode: 0, stdout: `Disabled Code Cleanup for ${options.project}.` };
        },
      }),
      show: cliCommand({
        summary: "Show project enablement and prompt source",
        options: projectOption,
        async run({ options }) {
          await requireStandardProject(options.project);
          const state = settings.get(options.project);
          return { exitCode: 0, stdout: `${options.project}: ${state.enabled ? "enabled" : "disabled"}; prompt: ${state.prompt === null ? "default" : "custom"}` };
        },
      }),
      "prompt set": cliCommand({
        summary: "Replace this project's guidance with custom text",
        options: {
          ...projectOption,
          text: { type: "string", required: true, stdin: true, description: "Nonblank instruction text (up to 4096 characters)" },
        },
        async run({ options }) {
          await requireStandardProject(options.project);
          if (options.text.trim() === "" || options.text.length > 4096) {
            throw new PluginCliError("Prompt must be nonblank and at most 4096 characters", { code: "invalid_value" });
          }
          settings.setPrompt(options.project, options.text);
          return { exitCode: 0, stdout: `Saved custom guidance for ${options.project}.` };
        },
      }),
      "prompt reset": cliCommand({
        summary: "Restore the default guidance for one project",
        options: projectOption,
        async run({ options }) {
          await requireStandardProject(options.project);
          settings.resetPrompt(options.project);
          return { exitCode: 0, stdout: `Restored default guidance for ${options.project}.` };
        },
      }),
    },
  }));
}
