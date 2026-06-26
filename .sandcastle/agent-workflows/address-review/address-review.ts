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
  gh,
  required,
  standardSchema,
  writeJson,
} from "../shared/common.ts";
import { runWithExtraction } from "../shared/run-with-extraction.ts";

interface Reply {
  readonly comment_id: number;
  readonly body: string;
}

interface AddressOutput {
  readonly replies: readonly Reply[];
}

const addressOutputSchema = standardSchema<AddressOutput>((value) => {
  const record = asRecord(value, "address-review output");
  return {
    replies: asArray(record.replies, "replies", (entry, label) => {
      const reply = asRecord(entry, label);
      return {
        comment_id: asNumber(reply.comment_id, `${label}.comment_id`),
        body: asString(reply.body, `${label}.body`),
      };
    }),
  };
});

interface RawComment {
  readonly id: number;
  readonly path?: string;
  readonly line?: number | null;
  readonly original_line?: number | null;
  readonly body?: string;
  readonly diff_hunk?: string;
  readonly user?: { readonly login?: string };
}

const PR_NUMBER = required("PR_NUMBER");
const BRANCH = required("BRANCH");
const REPO = required("GH_REPO"); // owner/repo

try {
  // Fetch every inline review comment (Copilot + the Claude reviewer). gh merges
  // paginated array responses into one JSON array.
  const raw = gh([
    "api",
    "--paginate",
    `repos/${REPO}/pulls/${PR_NUMBER}/comments?per_page=100`,
  ]);
  const comments = JSON.parse(raw) as RawComment[];

  if (comments.length === 0) {
    writeJson("replies.json", []);
    console.log("No review comments to address — skipping fix agent.");
    process.exit(0);
  }

  // Compact view the agent reasons over; keep the fields it needs to locate and
  // reply to each thread.
  const commentsForPrompt = comments.map((c) => ({
    id: c.id,
    path: c.path,
    line: c.line ?? c.original_line ?? null,
    author: c.user?.login,
    body: c.body,
    diff_hunk: c.diff_hunk,
  }));

  const result = await runWithExtraction({
    name: `address-review-#${PR_NUMBER}`,
    agent: claudeAgent(),
    sandbox: noSandbox(),
    logging: { type: "stdout" },
    promptFile: path.join(import.meta.dirname!, "prompt.md"),
    promptArgs: {
      PR_NUMBER,
      BRANCH,
      COMMENTS: JSON.stringify(commentsForPrompt, null, 2),
    },
    output: sandcastle.Output.object({
      tag: "output",
      schema: addressOutputSchema,
    }),
    extractionPrompt: fs.readFileSync(
      path.join(import.meta.dirname!, "extraction.md"),
      "utf8",
    ),
  });

  writeJson("replies.json", result.output.replies);

  console.log(
    `Addressed ${comments.length} comment(s); produced ${result.output.replies.length} reply(ies).`,
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
