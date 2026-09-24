import { z } from "zod";

const restFileSchema = z.object({
  filename: z.string(),
  previous_filename: z.string().optional(),
  status: z.string(),
  patch: z.string().optional(),
});

const restFilePagesSchema = z.array(z.array(restFileSchema));

export const reviewFileSchema = z.object({
  path: z.string(),
  previousPath: z.string().nullable(),
  status: z.string(),
  patch: z.string().nullable(),
});
export type ReviewFile = z.infer<typeof reviewFileSchema>;

export function parsePrFiles(pages: unknown): ReviewFile[] {
  return restFilePagesSchema.parse(pages).flatMap((page) =>
    page.map((file) => ({
      path: file.filename,
      previousPath: file.previous_filename ?? null,
      status: file.status,
      patch: file.patch ?? null,
    })),
  );
}

export function gitPatch(file: ReviewFile): string | null {
  if (file.patch === null) return null;
  const oldPath = file.previousPath ?? file.path;
  const headers = [`diff --git a/${oldPath} b/${file.path}`];
  if (file.status === "added") headers.push("new file mode 100644");
  if (file.status === "removed") headers.push("deleted file mode 100644");
  if (file.status === "renamed") headers.push(`rename from ${oldPath}`, `rename to ${file.path}`);
  if (file.status === "copied") headers.push(`copy from ${oldPath}`, `copy to ${file.path}`);
  headers.push(
    file.status === "added" ? "--- /dev/null" : `--- a/${oldPath}`,
    file.status === "removed" ? "+++ /dev/null" : `+++ b/${file.path}`,
  );
  return `${headers.join("\n")}\n${file.patch}\n`;
}
