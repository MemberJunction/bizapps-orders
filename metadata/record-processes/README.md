# Record Processes

The three record processes in `.record-processes.json` are retired with `deleteRecord`. Each one ran a scheduled scoring job with one of the ML models that `metadata/ml-models` retires, so with those models gone it would score with a model that does not exist. No release seed ever carried them, so no host has them; a push removes them from a database that does and skips them on one that does not.

An install that trains a model from a pipeline in `metadata/ml-training-pipelines` creates its own scoring process for it.

A database that pushed these processes before they were retired keeps the scheduled job each one created ("Record Process: Score ..."). Record processes do not remove their job when deleted, so disable or delete those jobs by hand. A process that has run also has Process Run rows that reference it, and the push cannot delete it until those rows are gone.
