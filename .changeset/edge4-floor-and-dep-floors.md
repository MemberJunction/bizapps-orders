---
"@mj-biz-apps/orders-entities": minor
---

Platform floor to MJ 6.1.0-edge.4 and app dependency floors to the latest
releases, read from npm at cut time: bizapps-common >=5.36.0,
bizapps-accounting >=0.4.0, bizapps-tasks >=1.4.0. Every @memberjunction/*
dependency now pins ^6.1.0-edge.4 — caret, never exact: orders-ng's exact
ng-hierarchy-tree pin forced two MJ copies into consumers' Explorer trees and
split the ClassFactory registry (consumers carried a root override to undo it).
