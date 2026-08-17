# Change Discipline

## Documentation Is Part of the Change

Update documentation in the same change when implementation alters a documented contract, behavior, structure, or workflow. Do not create meaningless documentation churn for internal refactors that preserve documented behavior.

Update the appropriate files:

- `README.md`: project overview, quick start, primary commands, high-level stack.
- `docs/SETUP.md`: prerequisites, environment variables, Supabase setup, Docker/onboarding.
- `docs/DEVELOPMENT.md`: local workflow, package-management conventions, Docker workflow.
- `docs/ARCHITECTURE.md`: feature ownership, dependency direction, route/module structure, runtime architecture.
- `docs/DATABASE.md`: schema, constraints, relationships, persistence assumptions, RLS-related schema effects.
- `docs/SECURITY.md`: authentication, authorization, RLS, public access, secrets, security controls.
- `docs/TESTING.md`: tooling, commands, test organization, required strategy.
- `CONTRIBUTING.md`: contributor/review/PR expectations.
- `CONTEXT.md`: accepted domain vocabulary only; never implementation detail.

Create/update an ADR only when the decision is expensive to reverse, surprising without context, and the result of a real trade-off.

## Testing Expectations

Prioritize behavior and invariants:

- Provider A cannot access Provider B data.
- one RepairRequest cannot produce two Repairs.
- a new Repair begins `IN_PROGRESS`.
- completed-state behavior is enforced.
- public tracking never exposes internal notes/private identifiers.
- Server Actions validate untrusted input and derive trusted Provider context server-side.

Use component tests where interaction logic merits them and Playwright for critical end-to-end workflows.

## Completion Checklist

Before declaring a non-trivial change complete:

```text
[ ] Existing implementation and relevant docs were inspected.
[ ] Installed Next.js guidance was checked for framework-sensitive code.
[ ] New code belongs to the correct feature/route location.
[ ] No unnecessary abstraction or dependency was introduced.
[ ] Server/client boundaries are correct.
[ ] Authorization and Provider isolation remain intact.
[ ] Untrusted input is validated.
[ ] Public output is purposefully restricted.
[ ] Responsive behavior was considered.
[ ] Relevant tests were added/updated and actually run.
[ ] Relevant documentation was updated.
[ ] No unrelated rewrites or dead code remain.
```
