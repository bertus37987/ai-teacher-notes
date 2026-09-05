# Hackathon Project Guidance

## Goal

- Optimize for a working, demonstrable prototype that solves the stated user problem.
- Keep the main user journey reliable, simple, and easy to explain in a short demo.
- Record important product decisions and assumptions in the repository as they emerge.

## Working Style

- Inspect the existing code and documentation before making changes.
- Prefer the smallest coherent implementation that delivers end-to-end value.
- Make reasonable, reversible assumptions when details are missing and document them.
- Preserve user changes and avoid unrelated refactors during time-sensitive work.
- Never commit secrets, tokens, credentials, or personal data.
- Keep dependencies minimal; explain any new production dependency in the handoff.

## Implementation

- Follow the conventions already established by the codebase.
- Keep modules and functions focused; use clear names and comments only where intent is not obvious.
- Handle loading, empty, success, and failure states for user-facing flows.
- Keep accessibility and responsive behavior in scope for UI changes.
- Update setup instructions whenever commands, environment variables, or prerequisites change.

## Browser and Testing

- Use the Playwright MCP server for browser-based inspection, interaction, and verification when a UI is available.
- Test the primary demo path after meaningful UI changes.
- Run the most relevant available automated checks before finishing.
- If full verification is not possible, report exactly what was and was not tested.

## Definition of Done

- The primary user flow works end to end.
- Relevant checks pass, or remaining failures are clearly documented.
- No secrets or debug-only artifacts are left behind.
- The final handoff summarizes the outcome, verification, assumptions, and next highest-value step.

## Memory and Durable Knowledge

- Use Codex memory for helpful continuity, not as the sole source of required project rules.
- Keep durable team conventions in this file and durable technical or product decisions in checked-in documentation.
- Do not place secrets, credentials, or sensitive personal information in memory or project notes.
