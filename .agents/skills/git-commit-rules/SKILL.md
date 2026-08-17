---
name: git-commit-rules
description: Use when the user asks Codex to create, plan, review, split, stage, or prepare Git commits, branch work, or pushes. Enforces strict user approval before pushing or creating branches, scoped commits by related idea/module, and commit messages in tag[author_name]: description format.
---

# Git Commit Rules

## Core Rules

- NEVER AUTO PUSH. Never push unless the user explicitly instructs Codex to push in the current task. No inferred pushes, no implicit pushes after commit, no "helpful" pushes, no overrides.
- Never create or switch branches unless the user explicitly instructs Codex to do so, or approves a branch name after Codex asks.
- Before committing, inspect the working tree and group files by related idea, feature, module, or purpose.
- Do not create one commit containing all changes when unrelated ideas are present.
- Prefer focused commits that are easy to review and revert.

## Push Safety

Pushing is a separate, explicit user action. Creating a commit, creating a branch, staging files, finishing implementation work, opening a PR, or preparing a completion report does not imply permission to push.

Only run `git push` when the user has clearly and explicitly asked Codex to push. If the user did not say to push, stop after the local operation and report what was done.

## Branch Workflow

When branch work is needed:

1. If the user did not provide a branch name, ask first.
2. Recommend clear branch names using a conventional prefix such as `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, or `test/`.
3. Do not create the branch until the user confirms the name.

Good examples:

```text
feat/auth-users-foundation
fix/prisma-login-identifier
docs/typescript-server-guide
chore/project-scaffold
```

Avoid vague or agent-branded names unless the user asks for them.

## Commit Scope

Each commit should represent one related idea.

Use one commit when the files all belong to the same module, feature, fix, or mechanical purpose. For example, files for the users module can be committed together when they all support the same users-module change.

Do not mix unrelated work in one commit, such as auth logic, frontend styling, and Prisma migrations, unless the user explicitly asks and understands the tradeoff.

File count guidance:

- Target 3 to 5 files per commit when practical.
- Do not exceed 5 files in a commit by default.
- A commit may have fewer than 3 files when the change is naturally small, such as a one-file bug fix or documentation correction.
- A commit may exceed 5 files only for one mechanical or unavoidable purpose, such as relocating a module, renaming a folder, applying a single formatting rule, or committing generated migration files tied to one schema change.
- Even in large mechanical commits, exclude unrelated files and commit them separately.

## Commit Message Format

Use this exact format:

```text
tag[author_name]: description
```

Allowed tags include common conventional tags:

```text
feat
fix
chore
docs
refactor
test
style
perf
build
ci
revert
```

Description rules:

- Describe one related idea, module, or purpose.
- Do not be too vague, such as `feat[user]: update files`.
- Do not be overly specific with every file name or tiny edit.
- Keep it concise and reviewable.

Good examples:

```text
feat[ojthink]: add auth and user module scaffolds
fix[ojthink]: correct Prisma login identifier schema
docs[ojthink]: document TypeScript server startup
chore[ojthink]: organize shared server enums
```

Bad examples:

```text
feat[ojthink]: changes
feat[ojthink]: add auth.controller.ts auth.routes.ts auth.schema.ts auth.service.ts auth.types.ts and update app.ts
chore[ojthink]: commit everything
```

## Author Name

Before creating commits, ask what to use for `author_name` unless the user already provided it in the conversation or repository instructions.

If the user does not provide an author name, use their GitHub username when it can be discovered from local Git configuration or repository context. If it cannot be discovered reliably, ask instead of guessing.

## Staging Procedure

Before staging or committing:

1. Run `git status --short`.
2. Review changed files and group them by related idea.
3. Propose the commit groups and messages to the user when the grouping is not obvious.
4. Stage only the files for the current commit.
5. Commit using the required message format.
6. Repeat for the next related group.

Never stage unrelated files just because they are present in the working tree.

## Push Procedure

Only push after the user explicitly says to push in the current task.

If the user asks for a commit but not a push, stop after committing and report the local branch and commit result.
