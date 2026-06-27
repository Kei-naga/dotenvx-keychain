---
name: docs-navigation
description: "Navigate documents under docs/. Use when asked 仕様の場所, 設計どこ, docs案内, reading order, requirement location, or which file covers config, commands, security, errors, tests, or contribution workflow. Always inspect the live docs tree first so the skill still works as docs grow."
argument-hint: "知りたいトピック、コマンド、設計論点、または読みたい順番を指定する"
---

# Docs Navigation

## Outcome

- Find the smallest set of documents that answers the user's question.
- Explain the recommended reading order when more than one document matters.
- Stay correct even when new files or subdirectories are added under `docs/`.

## Current Anchors

- `docs/prd.md`: product intent, goals, non-goals.
- `docs/spec.md`: v1 behavior, scope, terminology, and contract.
- `docs/contributing.md`: Git and GitHub workflow, rulesets, and testing policy.
- `docs/designs/README.md`: index for detailed design documents.
- `docs/designs/*.md`: implementation-oriented detail by responsibility.

These are starting points, not a fixed catalog.
Always inspect the current `docs/` tree before answering.

## When to Use

- The user asks where a requirement or design decision lives.
- The user wants the right reading order before editing or reviewing.
- The user asks which document covers config, command flow, security,
  errors, tests, or contribution workflow.
- The user wants a topic-focused docs summary instead of a full dump.
- New docs may have been added and you need the current map.

## Procedure

1. Parse the request.
   - Extract the target topic, such as product intent, scope, config,
     ID, backend, command, security, acceptance criteria, or unknown.
   - Decide whether the user needs one file, a reading order, or a
     cross-document summary.
2. Scan the live docs tree.
   - List `docs/` and the most relevant subdirectories before assuming
     filenames.
   - Prefer nearby index files such as `README.md`, `index.md`, or
     table-of-contents style docs when they exist.
   - If a subdirectory has its own index, read that before opening leaf
     documents.
3. Choose the layer that owns the answer.
   - Why, goals, user problem, out of scope: `docs/prd.md`
   - Behavioral contract, constraints, definitions, platform rules:
     `docs/spec.md`
   - Branching model, rulesets, release flow, testing policy:
     `docs/contributing.md`
   - Implementation responsibility, branching, failure modes, command
     detail: `docs/designs/`
4. Route within the current structure.
   - Config, ID, root resolution:
     `docs/designs/10-config-and-id.md`
   - Secret store backend, OS mapping:
     `docs/designs/20-secret-store-backend.md`
   - CLI common runtime, arg parsing, child process:
     `docs/designs/30-cli-runtime-common.md`
   - `init` command:
     `docs/designs/40-command-init.md`
   - `run` command:
     `docs/designs/50-command-run.md`
   - `list` and `remove`:
     `docs/designs/60-command-admin.md`
   - Error taxonomy, security, acceptance:
     `docs/designs/70-error-security-test.md`
5. Future-proof the routing.
   - If new numbered files or subdirectories exist, use their filenames
     and local index docs to refine the map.
   - Do not assume numbering is exhaustive or stable.
   - When multiple docs seem plausible, pick a primary doc and list the
     secondary docs in reading order.
   - When no exact match exists, route by document layer first, then by
     the closest topic title.
6. Read only enough to answer.
   - Start with the most likely owner document.
   - Expand to adjacent docs only when the answer crosses boundaries or
     the first document stays ambiguous.
7. Respond with navigation, not just a dump.
   - Name the primary document or documents.
   - Explain why each document is relevant.
   - Give a reading order when more than one document is needed.
   - Call out documentation gaps or ambiguity when the docs do not fully
     answer the question.

## Decision Rules

- If the question is about why the project exists, goals, or support
  policy, start with `docs/prd.md`.
- If the question is about source-of-truth behavior or formal contract,
  start with `docs/spec.md`.
- If the question is about branch strategy, PR flow, rulesets, or test
  policy, start with `docs/contributing.md`.
- If the question is about implementation detail, start with
  `docs/designs/README.md` and then the closest design document.
- If the question names a command, prefer the command-specific design
  document after checking `docs/spec.md` for the contract.
- If the question names security, errors, or tests, prefer
  `docs/designs/70-error-security-test.md`, then widen to
  `docs/spec.md` if needed.
- If the docs tree has changed, trust the live directory scan over this
  current mapping.

## Completion Checks

- Identify at least one concrete document path.
- Explain why that path is the primary source.
- If multiple docs are needed, give a clear reading order.
- Note missing or unclear documentation instead of guessing.
- Reflect the current docs tree, not a stale hardcoded list.

## Response Pattern

Use this shape when useful:

1. Primary document
2. Supporting documents
3. Recommended reading order
4. Known gaps or ambiguity

## Example Prompts

- `docs配下で run の詳細設計はどこにある?`
- `設定ファイルの契約を読むならどの順で見ればいい?`
- `エラー処理とセキュリティ要件のドキュメントを案内して`
- `ブランチ運用とテスト方針はどこを見ればいい?`
- `Where is the source of truth for CLI scope and platform behavior?`
- `New docs were added under docs/. Map the current reading order for
init.`
