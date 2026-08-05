# Agent Execution Rules

## Before implementation

The agent must:

1. Read the governing SOT documents.
2. Inspect the existing implementation.
3. Identify existing services and tests.
4. State the bounded objective.
5. Identify affected invariants.

## During implementation

The agent must:

- reuse existing domain services where practical;
- avoid duplicate business logic;
- avoid unrelated refactoring;
- preserve tenant isolation;
- preserve transaction integrity;
- add or update tests;
- avoid changing permanent business rules silently.

## Prohibited agent behaviour

Agents must not:

- invent missing commercial rules;
- weaken authentication or database security;
- trust UI values for authoritative totals or permissions;
- implement post-MVP modules without approval;
- directly modify posted financial or inventory history;
- mark local offline records as server-synchronized without acknowledgement;
- declare work complete without validation.

## Stop conditions

The agent must stop and report rather than invent behaviour when:

- governing SOT documents conflict;
- tenant ownership cannot be resolved;
- a destructive migration is required;
- authorization requirements are unclear;
- duplicate domain implementations are discovered;
- acceptance criteria cannot be tested.
