---
name: create-commit
description: Use for creating commits at the users request; never commit based on an implied request or workflows.
---

# Safe Commit Workflow

## Purpose

Create reviewable commits while preserving unrelated work and following repository conventions. This workflow does not authorize a commit by itself. Create commits only when the user explicitly asks for a commit.

## Workflow

### 1. Establish whether committing is authorized

- Determine whether the user explicitly requested that changes be committed.
- If not, do not create a commit. You may inspect the repository or prepare a proposed staging plan if requested, then report that no commit was made.
- Do not push, amend, rebase, reset, clean, or discard changes unless the user explicitly asks for that specific action.

### 2. Inspect the repository before staging

Do not assume all existing staged changes belong to the requested work.

Before making any commit, inspect and record:

- `git status --short --branch`, including untracked files.
- The staged diff (`git diff --cached`).
- The unstaged diff (`git diff`).
- Recent commit subjects and authors (`git log`) to learn the repository's commit-message and attribution conventions.

### 3. Identify scope and preserve unrelated work

- Classify changed files and hunks as intended, unrelated, or unclear.
- Preserve unrelated and unclear work exactly as found. Do not revert, overwrite, or include it in a commit.
- If a file contains both intended and unrelated edits, stage only the intended hunks. Use patch staging or another precise method; do not stage the whole file.

### 4. Choose commit boundaries

- Group changes by cohesive, independently reviewable purpose.
- Split distinct purposes into separate commits when practical.
- For each commit, stage only the files or hunks for that purpose.
- Review the staged diff before committing. Confirm it contains the intended changes and no unrelated content.
- Do not include generated files or untracked files unless they are part of the intended change and repository conventions call for them.

### 5. Create each commit with Worktrunk

- Use `wt step commit` for each intended commit, including when the current checkout was not created by Worktrunk.
- If Worktrunk's lint or other pre-commit checks fail, do not bypass them. Report the failure and leave the changes available for correction.
- After each successful commit, inspect the resulting commit and working tree before proceeding to the next commit. Recheck the staged diff and scope so each commit remains isolated.

### 6. Verify and report

After the final commit:

- Inspect `git status --short --branch`, including remaining untracked files.
- Inspect the created commit(s), including full or unambiguous hashes, subjects, and file/hunk scope.
- Confirm unrelated work remains uncommitted and intact.
- Report each commit hash and scope, the checks and Worktrunk pre-commit result, and the remaining working-tree state.
- If no commit was created, state that clearly and explain why.

## Stop conditions

Stop without committing when:

- The user has not explicitly authorized a commit.
- Intended changes cannot be separated from unrelated work with confidence.
- `wt step commit` is missing or fails.
- Required pre-commit checks fail and cannot be resolved without broadening scope or bypassing the check.

In each case, report what was inspected, what remains untouched, and the specific blocker.
