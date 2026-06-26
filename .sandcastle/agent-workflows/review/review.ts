import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  claudeAgent,
  fail,
  required,
  safeSh,
  standardSchema,
  writeJson,
} from "../shared/common.ts";
import { runWithExtraction } from "../shared/run-with-extraction.ts";

interface ReviewComment {
  readonly path: string;
  readonly line: number;
  readonly side: "LEFT" | "RIGHT";
  readonly body: string;
}

interface ReviewOutput {
  readonly summary: string;
  readonly comments: readonly ReviewComment[];
}

const reviewOutputSchema = standardSchema<ReviewOutput>((value) => {
  const record = asRecord(value, "review output");
  return {
    summary: asString(record.summary, "summary"),
    comments: asArray(record.comments, "comments", (entry, label) => {
      const comment = asRecord(entry, label);
      const side = asString(comment.side, `${label}.side`).toUpperCase();
      if (side !== "LEFT" && side !== "RIGHT") {
        throw new Error(`${label}.side must be "LEFT" or "RIGHT"`);
      }
      return {
        path: asString(comment.path, `${label}.path`),
        line: asNumber(comment.line, `${label}.line`),
        side,
        body: asString(comment.body, `${label}.body`),
      };
    }),
  };
});

const PR_NUMBER = required("PR_NUMBER");
const BRANCH = required("BRANCH");

try {
  // The diff under review. `git diff main...HEAD` (three-dot) compares against
  // the merge base, matching what the PR shows.
  const diff = safeSh("git diff main...HEAD") ||
    safeSh(`gh pr diff ${PR_NUMBER}`);
  if (!diff.trim()) {
    fail("No diff to review (main...HEAD is empty).");
  }

  const result = await runWithExtraction({
    name: `review-#${PR_NUMBER}`,
    agent: claudeAgent(),
    sandbox: noSandbox(),
    logging: { type: "stdout" },
    promptFile: path.join(import.meta.dirname!, "prompt.md"),
    promptArgs: {
      PR_NUMBER,
      BRANCH,
      DIFF: diff,
    },
    output: sandcastle.Output.object({
      tag: "output",
      schema: reviewOutputSchema,
    }),
    extractionPrompt: fs.readFileSync(
      path.join(import.meta.dirname!, "extraction.md"),
      "utf8",
    ),
  });

  writeJson("review.json", result.output);

  console.log(
    `Review produced ${result.output.comments.length} inline comment(s) for PR #${PR_NUMBER}.`,
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
