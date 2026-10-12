# ML Training Pipelines

The nine pipelines in `.ml-training-pipelines.json` are retired with `deleteRecord`, like the models, scoring bindings and record processes built from them. Each one selects feature and target columns that no shipped schema has:

- The late-payment pipelines (on Order Headers) read `LatePaymentOutcome`, `CustomerPriorOrders`, `GrossTier` and others. A migration added those columns and they were removed again before release.
- The Person and Organization LTV pipelines read `CustomerActualLTV`, `FirstOrderGross` and others, which only a developer script ever computed.

Training from one on a host would read columns that are not there. No release seed ever carried them, so no host has them; a push removes them from a database that does and skips them on one that does not.

A database that trained a model from one of these pipelines keeps that model's rows, and the push cannot delete a pipeline while a model or training run references it. Delete those first.
