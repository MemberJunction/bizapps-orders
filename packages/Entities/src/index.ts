/**
 * @mj-biz-apps/orders-entities — the app's ENTITY package.
 *
 * WHAT LIVES HERE
 *   src/generated/entity_subclasses.ts — written by MemberJunction CodeGen
 *   (`npm run mj:codegen` at the repo root). One strongly-typed BaseEntity
 *   subclass + zod schema per table in your app's schema. COMMIT this
 *   generated code — the committed code is the source of truth consumers
 *   install; CodeGen on a clean branch is an expected no-op.
 *
 * PEER DEPENDENCIES (see package.json + docs/versioning-and-peer-deps.md)
 *   @memberjunction/core + global are PEERS (^X.Y.Z), never hard deps —
 *   exactly one copy of each may exist in a host process; a second copy
 *   splits MJ's class factory and silently breaks registration.
 *
 * TODO(template): nothing to hand-write here initially. After your first
 * migration + codegen run, the generated subclasses appear below. Add any
 * hand-written helpers in src/ (NOT src/generated/ — CodeGen owns that).
 */
export * from './generated/entity_subclasses';
