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

## Design references and implementation decisions

- **SuperDesign Skill (current):** https://github.com/superdesigndev/superdesign-skill — use its design exploration and codebase-first approach for major page/layout redesigns. The full SuperDesign CLI/canvas service requires its own runtime and potentially login; referencing the skill here does not install, execute, or authenticate that service.
- **React Bits:** https://reactbits.dev — choose individual interactions only when they improve comprehension, feedback, or navigation. React Bits components require React; JobRadar is currently static HTML/CSS/vanilla JS. Do not paste React JSX into `index.html`. Consider the library after a planned React migration or deliberately recreate a small interaction in vanilla CSS/JS with accessible fallbacks.
- **Original SuperDesign repo:** https://github.com/superdesigndev/superdesign — archived IDE extension, not a current dependency. Prefer the maintained skill.
- **Emil Design Engineering skill:** `.agents/skills/emil-design-eng/SKILL.md` — use for detailed interaction polish, timing, easing, and motion restraint.

### JobRadar design direction

Professional search/workspace, not an animated marketing landing page. The current light workspace/dark navigation is a starting point, not a finalized brand.
For any redesign proposal, produce at least two clearly different design alternatives (layout, hierarchy, and component treatment), not merely palette changes. Prioritize:
1. A readable high-density opportunities view with verified-vacancy evidence and hard-requirement reasons.
2. Candidate/profile switching that visibly isolates each person's jobs, applications, and CV.
3. A profile settings form with JSON import/export and incomplete-field review.
4. Responsive mobile layout with usable navigation and no horizontal clipping of critical actions.
5. Clear loading, stale, verification-unknown, errors, and empty states.

No animated backgrounds, gratuitous text motion, hover-only essential controls, or dependency-heavy effects on the job table. Favor targeted transitions below 250 ms, `prefers-reduced-motion`, and keyboard access. Keep scanning/job state behavior unchanged when applying design updates.
