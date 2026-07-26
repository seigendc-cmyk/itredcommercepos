# Offline Infrastructure Rules

Status: controlled offline checkout approved under the 26 July 2026 SOT amendment.

## Runtime and storage boundary

- iTred Commerce POS is currently a web-only React/Vite application, not Electron, Capacitor, Tauri or an installed PWA.
- The offline database uses SQLite compiled to WebAssembly through `sql.js`.
- SQLite database bytes may be persisted in the browser Origin Private File System, with IndexedDB as a compatibility fallback.
- `localStorage` is not SQLite and must not be used as the offline transaction database.
- `VITE_ENABLE_OFFLINE_INFRASTRUCTURE` and `VITE_ENABLE_CONTROLLED_OFFLINE_CHECKOUT` remain deployment opt-ins.
- Uncontrolled offline checkout remains prohibited.
- Controlled offline checkout may create `COMPLETED_PENDING_SYNC` sales only through the approved atomic engine.

## Checkout governance

- Firestore remains authoritative when online.
- SQLite is temporarily authoritative for a controlled offline sale on its enrolled branch terminal.
- Every completed offline sale must remain pending sync and fiscalisation until separately acknowledged.
- Server acceptance, reconciliation and conflict-resolution decisions are not implemented by this branch.

## Tenant and record controls

- Repository reads and writes require tenant, vendor, branch and terminal scope.
- Locally created records use cryptographically secure UUIDs.
- Queue records use independent idempotency keys and explicit `PENDING`, `SYNCING`, `SYNCED`, `FAILED`, `CONFLICT` or `REQUIRES_REVIEW` states.
- Historical sale-item price and tax snapshots are immutable.
- Conflict records and audit events are append-oriented and must remain available for review.

## Encryption and key management

- SQLite exports are encrypted with AES-256-GCM before OPFS or IndexedDB persistence and backup.
- The operational data key is wrapped with a non-extractable AES-KW device key stored by the browser cryptographic key store.
- Encryption keys must be generated outside SQLite and must never be stored in the database, `localStorage`, IndexedDB, source code, environment bundles or sync payloads.
- Device enrolment records the wrapped operational key, key version and device identity. Future server-managed key escrow or recovery belongs in managed KMS/HSM infrastructure.
- A device data-encryption key must be wrapped per authorised terminal, rotated on enrolment changes, and destroyed when the terminal is revoked.
- Backups must be independently encrypted and authenticated before restore.
- Database opening must fail closed when key retrieval, authentication or integrity verification fails.

## Offline user credentials

- Plain-text passwords must never be stored.
- Only server-approved, salted derived verifiers may be stored, with the algorithm and credential version recorded.
- Approved verifier algorithms must be memory-hard where runtime support permits, such as Argon2id or scrypt. PBKDF2-SHA256 requires a separately approved iteration policy.
- Offline authorisation must expire, support revocation, and be scoped to the enrolled tenant, vendor, branch and terminal.
