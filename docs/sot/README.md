# iTred Commerce POS Source-of-Truth Index

Status: Approved index
Version: 1.0
Owner: iTred Commerce Product and Engineering
Last updated: 27 July 2026

`docs/sot` is the authoritative source for approved application behaviour. Agent instructions, UI copy, comments and implementation convenience do not override these documents.

## Precedence

1. A specific approved and effective SOT governs its stated capability.
2. A dated approved amendment overrides an older conflicting rule only within the amendment's explicit boundary.
3. General SOT rules apply where no more specific approved rule exists.
4. `AGENTS.md` governs working practices but cannot weaken an SOT.
5. Code that conflicts with an SOT must be reported and corrected or supported by an approved amendment.

The controlled offline checkout amendment is a narrow exception to the general prohibition on uncontrolled offline sales. It does not approve server acceptance or reconciliation.

## Core documents

| Document | Purpose |
|---|---|
| `MVP_SCOPE.md` | Included, conditional and excluded MVP capabilities |
| `AUTH_RULES.md` | Firebase vendor authentication and session rules |
| `CART_AND_CHECKOUT_RULES.md` | Cart, payment confirmation and atomic checkout |
| `INVENTORY_RULES.md` | Branch inventory and atomic sale deductions |
| `ENTITLEMENT_RULES.md` | Licensed warehouse, branch and terminal lifecycle |
| `INVENTORY_APPROVAL_RULES.md` | Controlled inventory decisions and segregation of duties |
| `BRANCH_AND_RELEASE_RULES.md` | Git, validation and release gates |
| `UI_UX_DESIGN_SYSTEM.md` | Canonical tokens, components and accessibility |

## Controlled offline documents

- `CONTROLLED_OFFLINE_CHECKOUT_AMENDMENT.md`
- `OFFLINE_INFRASTRUCTURE_RULES.md`
- `OFFLINE_ARCHITECTURE.md`
- `OFFLINE_ACCEPTANCE.md`
- `OFFLINE_ENCRYPTION.md`
- `OFFLINE_BI_EVENTS.md`
- `SQLITE_SCHEMA.md`

## Change control

An approved SOT change must identify its owner, version, status, effective date where applicable, affected services, rules, migrations and tests. It must preserve historical data and tenant isolation.

No document may claim legal, tax, customs or fiscal compliance for a country without validation against current official requirements.

All applicable tests, lint, production build and `git diff --check` must pass before release unless an authorised exception records the exact risk, owner and expiry.
