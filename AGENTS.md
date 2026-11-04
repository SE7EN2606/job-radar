# JobRadar development guidance

## Interface design

For changes to HTML, CSS, user interactions, forms, settings, dashboards, or responsive behavior, read and apply `.agents/skills/emil-design-eng/SKILL.md` (from https://github.com/emilkowalski/skills).

Principles:
- Prioritize function and correctness over decorative motion.
- Keep repeated navigation and job-list interactions instantaneous.
- Buttons need clear press, hover, keyboard focus and disabled states.
- If an occasional drawer animates, keep it short, interruptible, transform/opacity-only, and honor reduced-motion preferences.
- Ensure readable hierarchy, consistent spacing, clear system feedback and robust long-content handling.
- Do not regress scanning, data verification, candidate profiles, CV separation, or the existing application-state persistence.
- Never surface or commit private CV/contact data for additional users.
- Use actual backend state to distinguish live verified jobs from unverified sources; styling is not proof of status.

The design skill is guidance rather than a component library. Avoid adding dependencies solely for decoration.
