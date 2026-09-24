/** The only default cleanup policy contributed to BB agent sessions. */
export function defaultGuidance(projectId: string): string {
  return `Code Cleanup for project ${projectId}:
While doing your assigned work, notice substantial, actionable cleanup in files you edit or directly adjacent code you read. Examples: a fragile boundary, repeated logic that makes changes risky, or a hard-to-test module with a concrete improvement. Use judgment; minor style nits, formatting, and taste alone do not merit tasks.
Stay focused on the current task. For a worthwhile separate follow-up, first check existing tasks with bb task-board list --project ${projectId} --query "relevant terms". If there is no matching task and bb task-board is available, create one with bb task-board add --project ${projectId} --prompt "Describe the location, problem, and desired outcome". Write an actionable prompt, then return to your current work. If bb task-board is unavailable, report the candidate to the user instead of claiming to have created a task.`;
}
