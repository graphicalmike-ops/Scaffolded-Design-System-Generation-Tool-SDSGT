// The three designer-filled project notes a generated project gets:
// research-and-insights.md, decisions.md and to-do.md. Each ships with
// instructions only, never sample entries — the content belongs to the
// project's own team. When an agent should read each one is stated in the
// rules file (generate/project-docs.ts), so they aren't read every session.
//
// Written by `generate`, copied by `scaffold` once and never overwritten by
// `scaffold --update` (shared/scaffold-common.ts, copyAgentDocs).

import type { RulesFileName } from "./project-docs.ts";

export const PROJECT_NOTE_FILES = ["research-and-insights.md", "decisions.md", "to-do.md"] as const;

const RESEARCH_AND_INSIGHTS_MD = `# research-and-insights.md

What the team knows about its users, market and product — from research,
stakeholders, product managers and the designers themselves. Agents use it
to point out when a request goes against something the team has already learned.

## For designers

- Add one insight per line under **Insights**, using the format below.
- Start each with an area tag (e.g. \`[Onboarding]\`, \`[Checkout]\`) so agents
  can find what's relevant quickly.
- Keep each insight to one or two sentences. Link to the full research
  rather than pasting it in.
- Update or remove an insight when it stops being true.

## For agents

- If a request conflicts with an insight, say so before doing the work:
  quote the insight, explain the clash in one sentence, and ask whether to
  go ahead.
- Never block, refuse or quietly change the request. The designer decides.
- If the designer goes ahead anyway, ask whether to log that in \`decisions.md\`.
- Don't judge whether an insight is right — only whether a request conflicts with it.
- Don't add, edit or remove insights on your own. If the designer shares a
  new finding in conversation, ask whether to add it here.

## Format

\`- [Area] Insight. — Source, YYYY-MM-DD\`

## Insights

_None yet._
`;

function buildDecisionsMd(rulesFile: RulesFileName): string {
  return `# decisions.md

A short log of the project's important decisions — what was decided, by
whom, and why — so nobody (person or agent) re-argues or quietly undoes them.

## For designers

- Agents will ask before logging anything. You can also add rows yourself.
- One row per decision, newest at the bottom.
- When a decision replaces an older one, say so in the new row
  (e.g. "replaces 2026-03-02") and leave the old row in place.

## For agents

- When an important decision is made in conversation (a flow, a feature's
  scope, a component or token choice, a team convention, or going against an
  insight in \`research-and-insights.md\`), ask whether to log it here.
  Never log without asking.
- If yes, ask who made the decision and why — don't guess either. Fill in
  today's date yourself.
- Keep each cell as short as it can be without losing meaning.
- Before suggesting something that would undo a logged decision, point out
  the decision and ask.
- When this table passes 50 rows, offer to move the older ones into
  \`decisions-backup.md\`, keeping the latest 20 here. Only do it if the
  designer agrees. \`decisions-backup.md\` isn't linked from \`${rulesFile}\` —
  read it only when someone asks you to.

## Decisions

| Date | Decision | Who | Why |
|---|---|---|---|
`;
}

const TO_DO_MD = `# to-do.md

Things the team has chosen to do later. Agents use it to remind you of
pending items when you're working in the same area.

## For designers

- One row per item. The Area column (e.g. \`Checkout\`) lets agents match
  items to what you're working on.
- Agents will ask before adding or removing anything. You can also edit it yourself.

## For agents

- When something gets postponed in conversation ("later", "not now",
  "next round"), ask whether to log it here. Never log without asking.
- Add one row per item. Ask which area it belongs to if that isn't clear.
  Fill in today's date yourself.
- When starting work in an area, check the Area column. If any rows match,
  mention them briefly — once per task, not repeatedly — and ask whether the
  designer wants to tackle them now.
- When an item gets done, ask whether to remove its row.

## To do

| Area | What needs doing | Added |
|---|---|---|
`;

export function buildProjectNotes(rulesFile: RulesFileName): Record<(typeof PROJECT_NOTE_FILES)[number], string> {
  return {
    "research-and-insights.md": RESEARCH_AND_INSIGHTS_MD,
    "decisions.md": buildDecisionsMd(rulesFile),
    "to-do.md": TO_DO_MD,
  };
}
