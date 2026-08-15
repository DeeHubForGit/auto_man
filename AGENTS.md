# AGENTS.md

## Purpose

This file provides mandatory guidance for AI coding agents working on Auto-Man.

Follow these instructions unless the user explicitly directs otherwise.

## Working Principles

- Inspect the relevant code, configuration and database schema before proposing or making changes.
- Do not invent files, fields, APIs, requirements or existing behaviour.
- Do not guess. If something cannot be confirmed from the repository, say what is uncertain.
- Understand the existing implementation and identify the root cause before fixing a bug.
- Challenge the requested approach if it is unnecessarily complex, unsafe or inconsistent with the existing design.
- Prefer the simplest reliable solution that fits the existing architecture.
- Do not add abstractions, helper functions, dependencies or configuration unless they are genuinely required.

## Scope of Changes

- Make only the changes required for the current task.
- Keep changes small, focused and surgical.
- Do not refactor, rename, reformat or tidy unrelated code.
- Do not remove existing comments unless they are incorrect or no longer relevant.
- Preserve existing behaviour unless the task explicitly requires it to change.
- Keep changes consistent with the style and patterns already used in the repository.
- Do not rewrite an entire file when a smaller targeted change is sufficient.

## Debugging

- Reproduce or trace the reported problem before changing code.
- Find evidence of the root cause using the code, browser console, network requests, logs or database schema.
- Do not apply speculative fixes.
- Explain the confirmed cause before or alongside the proposed fix.
- Check whether the problem is caused by data, configuration or existing code before adding new code.
- After fixing a bug, check for obvious regressions in the affected workflow.

## Design and Implementation

- Review the surrounding code before choosing an implementation.
- Reuse existing functions, components and patterns where appropriate.
- Do not introduce a new pattern when the existing pattern is adequate.
- If a requested solution conflicts with the project design or creates avoidable complexity, explain the concern and propose a better option.
- Ask before adding a new production dependency.
- Do not add future functionality that was not requested.

## User Interface and Form Patterns

- Before creating or changing a user interface, inspect `assets/css/theme.css` and the closest existing forms or admin sections.
- Use the normal shared button, input, select, label, card and validation styles already defined in `theme.css`.
- Do not invent new page-specific styling for buttons or standard controls when an existing shared style is suitable.
- Do not override the shared button or control system merely to make one form look different.
- New forms must follow the closest existing form in structure, spacing, control styling, button placement, validation, save feedback and mobile behaviour.
- Keep the user experience consistent across related maintenance forms.
- Simple forms should allow users to edit values directly in the displayed controls. Do not add a separate summary and edit mode when the form only contains a small number of straightforward fields.
- More complicated forms may display a summary or list first and then open a detailed edit form when the record contains enough information to justify the extra step.
- Do not add unnecessary Edit buttons, duplicate summaries or extra clicks to simple forms.
- If no existing form pattern clearly fits, explain the options and ask before introducing a new interface pattern.
- Do not add descriptions, icons, disabled states or responsive control variations unless they are requested or already used by the closest existing form.
- Preserve unsaved user input. Avoid rerendering an entire form or list after a save when doing so could discard changes in another control or record.

## Validation

- Run the most relevant available check after making changes.
- For UI changes, verify the affected workflow at desktop and mobile widths where practical.
- Check the browser console for new errors.
- Confirm that the final behaviour matches the request.
- Review the final diff for unrelated changes, regressions and accidental deletions.
- If validation cannot be completed, clearly state what was not tested and why.

## Auto-Man Project Constraints

- Auto-Man is a static HTML, CSS and JavaScript application using Supabase and PostgreSQL.
- Do not introduce Ruby on Rails or another framework unless explicitly requested.
- Do not update production or supported databases directly.
- Database changes must be supplied as reviewable SQL scripts or migrations.
- When creating a table in the public schema, include explicit minimum-required GRANT statements, enable RLS and add the required policies. Do not assume a new table is automatically available through supabase-js.
- Use descriptive database column and foreign-key names.
- Preserve compatibility with existing Google Calendar, Stripe, SMS and email integrations unless the task explicitly changes them.
- Treat Auto-Man booking records as the intended source of truth for the future internal booking system, with Google Calendar as a secondary synchronisation and conflict-checking layer.
- Do not expose credentials, API keys, service-role keys or private configuration.

## Response After Changes

Briefly report:

1. The confirmed cause or requirement.
2. The files changed.
3. What was changed.
4. What validation was performed.
5. Any remaining uncertainty or follow-up work.