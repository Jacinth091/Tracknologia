# Tracknologia GitHub Workflow

## Branch promotion model

Tracknologia uses a staged integration workflow:

```text
feature/NN/name
      |
      v
   staging
      |
      v
    master
```

Examples:

```text
feature/01/auth
feature/02/providers
feature/03/repair-requests
feature/04/repairs
feature/05/tracking
feature/06/analytics
```

`staging` is the integration branch. `master` is the release-ready branch.

## Recommended default branch

Set `staging` as the GitHub repository default branch.

This has two benefits:

1. New pull requests naturally target `staging`.
2. Dependabot security updates use the repository default branch, so they enter
   the integration branch instead of bypassing the staging workflow.

`master` remains the stable/release branch even though it is not the default branch.

## Pull request policy

Allowed promotion paths:

```text
feature/NN/name -> staging
fix/name        -> staging
hotfix/name     -> staging
chore/name      -> staging
dependabot/*    -> staging

staging         -> master
```

Direct feature-to-master pull requests are rejected by `branch-policy.yml`.

## Workflows

### `ci.yml`

Runs on pull requests targeting `staging` or `master`, and after pushes to
those integration/release branches.

Checks:

- dependency installation with `npm ci`
- lint
- TypeScript type checking
- Vitest unit/module tests
- production Next.js build

Expected `package.json` scripts:

```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test:run": "vitest run",
    "build": "next build"
  }
}
```

### `e2e.yml`

Runs Playwright against pull requests and merged branch states.

Required repository secrets:

```text
TEST_SUPABASE_URL
TEST_SUPABASE_PUBLISHABLE_KEY
```

These must point to a non-production test Supabase project.

Do not make the E2E check required until those secrets and the test environment
are configured.

### `docker.yml`

Builds the `runner` target from the repository `Dockerfile`.

The workflow verifies that the production container can still be built after
application, dependency, or Docker changes. It does not publish an image.

### `dependency-review.yml`

Reviews dependency changes introduced by pull requests and fails on newly
introduced vulnerabilities with `high` or greater severity.

Availability depends on the repository's GitHub security features.

### `branch-policy.yml`

Enforces:

```text
feature/NN/name -> staging
staging         -> master
```

It also permits `fix/*`, `hotfix/*`, `chore/*`, and `dependabot/*` into
`staging`.

## Recommended rulesets

### `staging`

Require:

- pull request before merging
- one approval
- resolved conversations
- `Branch Policy`
- `Verify`
- `Docker Build`
- `Dependency Review` when available
- `Playwright` after the E2E environment is configured

Block:

- force pushes
- branch deletion

### `master`

Require:

- pull request before merging
- one approval
- resolved conversations
- `Branch Policy`
- `Verify`
- `Docker Build`
- `Playwright`
- `Dependency Review` when available

Block:

- direct pushes
- force pushes
- branch deletion

The `Branch Policy` required check ensures that only `staging` can be promoted
into `master`.

## Feature branch workflow

Create a feature from current staging:

```bash
git checkout staging
git pull origin staging
git checkout -b feature/04/repairs
git push -u origin feature/04/repairs
```

Open a pull request:

```text
feature/04/repairs -> staging
```

After all intended features are integrated and staging passes full system
testing, open:

```text
staging -> master
```

## Keeping a feature current

While a feature is under development:

```bash
git fetch origin
git rebase origin/staging
```

Do not rebase shared `staging` or `master` history.
