# ML Models

The three models in `.ml-models.json` are retired with `deleteRecord`. They were trained on sample data, so their fitted parameters do not fit any install's data, and the trained artifact file each one needs to score was never shipped. A push removes them from a database that has them and skips them on one that does not.

The training pipelines in `metadata/ml-training-pipelines` are retired too, since they read columns no shipped schema has (see that folder's README). This app ships no ML metadata.
