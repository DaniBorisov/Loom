# Loom Agent Guidelines

## Linear Workflow Rules

### Mark issues Done when implementation is complete

When you finish implementing an issue and it passes all tests (lint, typecheck, unit tests):

1. **Mark the issue as Done** in Linear using `linear_save_issue` with `state: "Done"`
2. **Write a comment** (not a description edit) with `## Implementation` details, covering:
   - Which files were created or modified
   - What each endpoint/component does at a high level
   - Key architectural decisions (e.g. why a certain approach was chosen)
   - Any notable behavior or edge cases handled

The description stays untouched as the original spec. Comments provide the timestamped audit trail of what was built.

Do not leave issues in Backlog or In Progress after the code is merged and tests pass.

### Git Workflow

When you start working on an issue:

1. **Create a branch** from `develop`:
   - Bug fixes: `fix/DAN-{number}-{short-description}`
   - Features: `feat/DAN-{number}-{short-description}`

### Git Workflow (when done)

When implementation is complete and all tests pass:

1. **Commit changes** with conventional commit format: `fix(DAN-80): ...` or `feat(DAN-12): ...`
2. **Push branch** and **create PR** targeting `develop`
3. **Ask the user** if ready to merge — do not auto-merge

Do not commit directly to `develop`.

### Mark projects Done when all issues are Done

When every issue under a project is marked Done:

1. Use `linear_save_project` with `state: "Completed"` to close the project
