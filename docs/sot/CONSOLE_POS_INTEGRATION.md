# Console-POS Application Instance Integration

## Authority Boundary

The Console is authoritative for application-instance registration, platform
status, and heartbeat acknowledgement. The POS remains authoritative for its
local operational workflow. This contract does not give Console remote control
over completed sales, inventory balances, payments, or other posted records.

`itred-commerce-pos`, application type `POS`, and schema version `1` are the
only supported contract identifiers. In the current POS identity model,
`tenantId` and `vendorId` both resolve from the authenticated vendor profile ID.

## Identity And Registration

The POS first reuses the single approved device ID in the browser's
`itred-device-keys` store. Before device enrolment exists, it creates one
cryptographically random fallback device ID and persists it in IndexedDB. A
vendor-scoped registration record stores the Console-issued instance ID; vendor
IDs, emails, branch IDs, and terminal IDs are never used as instance IDs.

Registration starts only after Firebase authentication and vendor resolution.
It is enabled only by `VITE_ENABLE_CONSOLE_INTEGRATION=true` and requires
`VITE_CONSOLE_API_BASE_URL`. Missing or invalid configuration is diagnostic
only and never blocks POS startup.

## Heartbeats And Retry

A heartbeat follows registration and is sent at startup for an existing
registration, after branch or terminal assignment changes, when connectivity
returns, and every five minutes. Only one heartbeat may be in flight. Sign-out,
vendor changes, and component cleanup stop the interval and online listener.

Failed registration and heartbeat operations remain recorded in the
vendor-scoped IndexedDB connection state and are retried by the next startup,
interval, assignment change, or connectivity-restored signal. The cache holds
identity, status, timestamps, error code, schema version, platform status, and
pending operation names. It never stores access tokens.

`RETIRED` and unsupported schema results are terminal cached states and are not
retried indefinitely. Console availability, rejection, or timeout cannot block
local sales or inventory operation.

## Development Authentication Warning

The current Console header context is development-only. It may send
`x-tenant-id`, `x-vendor-id`, `x-staff-id`, `x-role-id`, and `x-permissions`
only when `VITE_ENABLE_CONSOLE_DEVELOPMENT_HEADERS=true`. Production builds
refuse that configuration. These headers are not production authentication,
and no administrator secret or access token belongs in a Vite variable.

## Diagnostics

BI records contain only controlled event names, error codes, and Console
instance IDs. Response bodies, access tokens, and sensitive headers are never
included. Events cover registration success/failure, heartbeat success/failure,
unsupported schema, and retired instances.
