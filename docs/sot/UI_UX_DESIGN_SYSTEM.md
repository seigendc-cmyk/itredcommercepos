# iTred Commerce POS UI/UX Design System SOT

Status: Approved implementation baseline  
Applies to: Vendor onboarding, authentication, staff desks, POS, inventory, logistics, reporting, BI, billing and administration  
Canonical aesthetic reference: Business Setup / Vendor Onboarding workflow

## 1. Authority and scope

This document is the source of truth for the visual and interaction layer of iTred Commerce POS. New interface work and migrations must conform to these rules without changing business permissions, validation, transaction processing, audit, BI, fiscalisation or inventory behaviour.

The canonical implementation sources are:

- `src/index.css` for design tokens and application-wide behaviour;
- `src/components/Common/ui.tsx` for shared UI primitives;
- `src/components/Common/Modal.tsx` for shared dialog presentation and behaviour.

Screen-specific copies of shared controls must not become competing standards.

## 2. Design principles

- iTred orange is the primary action and emphasis colour.
- Application canvases use a light-neutral background.
- Primary content surfaces are white with subtle grey borders.
- Text uses matt charcoal, with muted grey reserved for supporting information.
- Corners are sharp or minimally softened.
- Cards and controls must not default to large rounded corners or pill shapes.
- Spacing is compact, predictable and suitable for transaction-heavy professional workflows.
- Visual hierarchy must communicate operational importance, not decoration.
- Existing business logic and permission enforcement remain authoritative.

## 3. Canonical token schema

Tokens are CSS custom properties under the `--itred-*` namespace.

### 3.1 Colour tokens

| Token | Value | Purpose |
|---|---:|---|
| `--itred-color-primary` | `#f26322` | Primary actions and emphasis |
| `--itred-color-primary-hover` | `#d94f12` | Primary interactive hover |
| `--itred-color-primary-soft` | `#fff3eb` | Low-emphasis orange surface |
| `--itred-color-charcoal` | `#24272c` | Headers and strong navigation surfaces |
| `--itred-color-charcoal-strong` | `#17191d` | Charcoal hover or strong contrast |
| `--itred-color-text` | `#292d33` | Default text |
| `--itred-color-text-muted` | `#667085` | Supporting text |
| `--itred-color-canvas` | `#f5f6f7` | Application background |
| `--itred-color-surface` | `#ffffff` | Primary content surface |
| `--itred-color-surface-subtle` | `#fafafa` | Secondary surface |
| `--itred-color-border` | `#dfe3e8` | Default border |
| `--itred-color-border-strong` | `#c9cfd6` | Control and emphasised border |
| `--itred-color-focus` | `#f26322` | Keyboard focus ring |
| `--itred-color-success` | `#15803d` | Successful outcome |
| `--itred-color-warning` | `#b45309` | Warning or review state |
| `--itred-color-danger` | `#b42318` | Error or destructive action |
| `--itred-color-info` | `#175cd3` | Informational state |

Semantic colours must communicate a real state. Orange must not replace error, warning or success semantics.

### 3.2 Spacing tokens

The spacing scale is `--itred-space-1`, `2`, `3`, `4`, `5`, `6` and `8`, corresponding to 4, 8, 12, 16, 20, 24 and 32 pixels at the default root size.

Page and component spacing must use this scale or matching Tailwind increments. Arbitrary spacing values require an explicit layout reason.

### 3.3 Shape and elevation tokens

| Token | Value | Use |
|---|---:|---|
| `--itred-radius-sm` | `4px` | Badges and compact accents |
| `--itred-radius-md` | `6px` | Buttons and controls |
| `--itred-radius-lg` | `8px` | Cards and dialogs |
| `--itred-shadow-sm` | subtle | Bordered surface separation |
| `--itred-shadow-floating` | elevated | Dialogs and true floating workflows |
| `--itred-control-height` | `40px` | Default interactive control height |

`rounded-full`, large radii and heavy shadows are exceptions. They are allowed only for circular iconography, avatars, progress indicators, or an approved status treatment.

## 4. Shared component contracts

### Button

- Use `Button` for standard actions.
- Variants are `primary`, `secondary`, `quiet` and `danger`.
- The default HTML type is `button`; submit actions must declare `type="submit"`.
- Loading actions set `aria-busy`, remain labelled and prevent duplicate activation.
- Icon-only actions require an accessible name.

### Field

- Every field has a programmatically associated label.
- Required state is conveyed to assistive technology.
- Validation uses `aria-invalid` and an associated message.
- Placeholder text does not replace a label.

### Surface

- Use for bordered white content areas and floating cards.
- Nested surfaces should be avoided unless they express a meaningful hierarchy.

### Notice

- Use semantic `info`, `success`, `warning` or `error` tones.
- Errors use an alert role; non-blocking notices use a status role.
- Notifications must not rely on colour alone.

### LoadingState

- Use for full-view restoration or initialization.
- Loading text must explain the operation.
- Motion must respect the user's reduced-motion preference.

### Modal

- Use the shared Modal for dismissible dialog workflows.
- Dialogs expose `role="dialog"`, `aria-modal` and a labelled title.
- Escape dismissal and body scroll locking remain supported.
- Destructive or transaction-confirming dialogs must not close through accidental backdrop interaction unless specifically approved.
- Focus trapping and focus return are mandatory migration requirements before a dialog is marked fully compliant.

## 5. Page composition

Every operational page should use:

1. A page header containing title, concise context and primary actions.
2. Optional compact status or filter controls.
3. Bordered white sections on the neutral canvas.
4. Responsive data presentation appropriate to information density.

Section titles must describe business content. Decorative headings and repeated charcoal hero panels are not the default.

Tables require:

- meaningful column headers;
- keyboard-reachable row actions;
- loading, empty and error states;
- horizontal containment or responsive alternatives on narrow screens;
- no colour-only status communication.

## 6. Responsive behaviour

Supported review widths:

- mobile: 320 and 390 pixels;
- tablet: 768 pixels;
- desktop: 1024 and 1440 pixels.

Rules:

- No page may introduce viewport-level horizontal scrolling at 320 pixels.
- Primary actions remain visible or move into an accessible action menu.
- Forms become single-column on narrow screens.
- Dialogs preserve reachable headers and actions with independently scrollable content.
- Dense tables may use contained horizontal scrolling when a card/list alternative would hide essential business comparisons.
- Touch targets should be at least 40 by 40 pixels for primary mobile interactions.

## 7. Accessibility and keyboard rules

- All interactive controls must be reachable and operable by keyboard.
- Focus-visible treatment uses `--itred-color-focus`.
- Focus must never be removed without an equivalent visible replacement.
- Heading levels follow the page hierarchy.
- Form errors identify both the field and corrective action.
- Loading and asynchronous outcomes are announced where appropriate.
- Text and controls must maintain WCAG AA contrast.
- Motion is reduced when `prefers-reduced-motion` is enabled.
- Dialog focus must enter the dialog, remain contained and return to the invoking control.

## 8. Required UI states

Each data-driven page or section must deliberately support:

- initial loading;
- background loading or saving;
- empty data;
- validation failure;
- recoverable service error;
- blocked permission or business action;
- successful completion;
- offline or synchronization state where applicable.

A failed BI write after a committed business transaction must be represented as a secondary telemetry condition and must not visually convert the committed transaction into a failure.

## 9. Prohibited patterns

- New hard-coded brand colours when an approved token exists.
- Screen-specific button, input, dialog, notification or card systems.
- Excessive `rounded-xl`, `rounded-2xl`, `rounded-3xl` or pill controls.
- Heavy shadows on ordinary page sections.
- Using placeholder text as a form label.
- Hiding focus indicators.
- Making a disabled action the only explanation of a permission or business-rule block.
- Introducing another UI framework without explicit architectural approval.
- Styling changes that bypass service or Firestore permission enforcement.

## 10. Migration order

Migration follows operational risk and frequency:

1. Onboarding.
2. POS sales terminal.
3. Login and staff access.
4. Inventory.
5. Branch and warehouse management.
6. Purchasing.
7. Sales history.
8. BI and decision pages.
9. Customers and suppliers.
10. Subscription, settings and administration.

A page is:

- `COMPLIANT` when it uses canonical tokens and shared components, has required responsive and accessibility states, and contains no unjustified duplicate primitives;
- `PARTIALLY COMPLIANT` when the shared foundation is present but local legacy patterns remain;
- `NON-COMPLIANT` when it predominantly uses local hard-coded presentation or lacks required states.

## 11. Change control

Changes to canonical tokens or component contracts require:

1. an authorised design-system change;
2. review of affected screens and contrast;
3. responsive and keyboard checks;
4. a recorded change in the repository;
5. migration notes where the change is breaking.

Business logic must not be altered solely to simplify a styling migration. Exceptions must be documented with the affected component, reason, owner and review date.

## 12. Verification evidence

Before a migrated page is marked complete:

- TypeScript must pass;
- the production build must pass;
- applicable automated tests must pass;
- mobile, tablet and desktop widths must be reviewed;
- keyboard order, focus visibility, labels and dialog behaviour must be reviewed;
- before/after screenshots or equivalent visual evidence must be retained;
- any approved exceptions and remaining non-compliant areas must be listed.

