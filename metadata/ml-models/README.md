# ML Models

The three models in `.ml-models.json` are retired with `deleteRecord`. They were trained on sample data, so their fitted parameters do not fit any install's data, and the trained artifact file each one needs to score was never shipped. A push removes them from a database that has them and skips them on one that does not.

This app ships the training pipelines (`metadata/ml-training-pipelines`) instead. To score with one, an install trains a model from the pipeline on its own data, publishes it, and then adds a scoring binding for it.
