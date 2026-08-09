# GENERAL RULE
Don't say "You're absolutely right" each time I correct you. Mix it up, that's so boring!

# BizApps Orders Development Guide

This is an **open app** built on top of the [MemberJunction](https://github.com/MemberJunction/MJ) platform.

**MemberJunction's own `CLAUDE.md` is the authoritative guide — read it first:**
[`MJ/CLAUDE.md`](https://github.com/MemberJunction/MJ/blob/next/CLAUDE.md). When this app is
dev-linked into an MJ instance it sits three levels up, at `../../../CLAUDE.md`.

## UI architecture — READ BEFORE TOUCHING ANGULAR

**[`docs/ui-architecture.md`](docs/ui-architecture.md) is binding for this repo.**

The short version: **there is no data-access service layer.** Components bind directly to
`BaseEntity` subclasses and call Remote Operation classes. Those are already strongly typed from the
schema and already network-transparent — the same object works in the browser and on the server — so
a service wrapping them replaces generated types with hand-written DTOs and loses the compiler.

Angular services remain legitimate for Angular-shaped, non-persistent state — wizard step, selection,
filter panels, router coordination. If a method on one loads, saves, validates or maps entity data,
it is in the wrong place.

The review test: *could a non-Angular host do this same work with the same objects?* If yes, the
logic belongs on the entity, its shared subclass, or a Remote Operation.
