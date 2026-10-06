# ML Model Scoring Bindings

The three bindings in `.ml-model-scoring-bindings.json` are retired with `deleteRecord`, along with the models they score with (see `metadata/ml-models/README.md`). The note below still applies to a binding an install creates for a People or Organizations model.

The scoring bindings for `MJ_BizApps_Common: People` and `MJ_BizApps_Common: Organizations` deliberately declare `TargetColumn: null`.

**Load-bearing constraint**: Orders predicts about upstream entities (People, Organizations) using downstream order signals. Because Orders depends on Common, writing columns into Common's schema would violate Common's consumer-blindness architectural invariant. Instead, `TargetColumn: null` routes predictions into `ResultPayload` (`MJ: Process Run Details`) keyed to the upstream record, without modifying Common's physical schema.
