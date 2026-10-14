# Organization profiles — integration contract and safety gate

Status: pure parser and tests committed, **not installed/enabled for organizations**.
The shared Open Mercato core and its official modules remain untouched.

- Source of configuration is an authorized **organization-scoped official Open Mercato config or feature-toggle contract**, after inspecting its exact 0.9.0 APIs. Do not create a second organization master or manually insert platform records.
- `parseOrganizationProfile` accepts an exact version-1 descriptor and rejects unknown/duplicate verticals or unexpected fields. It is deliberately independent of persistence and ACL.
- Server flow (future integration): resolve user session and active org from official context -> verify role/feature and org access -> load trusted org config -> parse descriptor -> intersect capability and ACL -> execute official module command. The parser alone never grants authorization.
- Vertical modules must use official `catalog`, `wms`, `sales`, `customers`, `directory`, and `auth` as sources of truth; restaurant table lifecycle and garment production state can be added only when no core authority exists.
- The isolated fixture guard is a **first barrier only**. Before executing seeding, the runner must verify authenticated DB identity, effective role, deployment environment, target allowlist, transactional permissions and rollback readiness; no sample-data runner exists yet.
- Next implementation gate: inspect installed 0.9.0 configs/feature-toggles and org context APIs and implement a server-authorized adapter plus isolation tests. Determine restaurant dining and garment lifecycle command contracts before proposing schema changes.
- No DDL, production data writes, merge or deployment are authorized by this document.
