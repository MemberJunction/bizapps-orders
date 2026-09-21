# ML Model Scoring Bindings

The scoring bindings for `MJ_BizApps_Common: People` and `MJ_BizApps_Common: Organizations` deliberately declare `TargetColumn: null`.

**Load-bearing constraint**: Orders predicts about upstream entities (People, Organizations) using downstream order signals. Because Orders depends on Common, writing columns into Common's schema would violate Common's consumer-blindness architectural invariant. Instead, `TargetColumn: null` routes predictions into `ResultPayload` (`MJ: Process Run Details`) keyed to the upstream record, without modifying Common's physical schema.
