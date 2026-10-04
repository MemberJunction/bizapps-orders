#!/bin/bash
# Fails if a metadata folder is missing from metadata/.mj-sync.json directoryOrder.
# Folders left out of the list are pushed after it in alphabetical order, so a
# folder whose rows reference another folder's rows can be pushed first. On a
# fresh database that fails the foreign key and rolls back the whole push
# (bizapps-accounting#222). Listing every folder keeps the push order explicit.
#
# It checks that each folder is listed, not that the list is in dependency order.

node - <<'NODE'
const fs = require('fs');
const path = require('path');

const root = 'metadata';
const config = JSON.parse(fs.readFileSync(path.join(root, '.mj-sync.json'), 'utf8'));
const listed = new Set(config.directoryOrder || []);

const folders = fs.readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, '.mj-sync.json')))
  .map((d) => d.name);

if (folders.length === 0) {
  console.log(`::error::no metadata folders with a .mj-sync.json found under ${root}/, so there is nothing to check`);
  process.exit(1);
}

const missing = folders.filter((f) => !listed.has(f));
const stale = [...listed].filter((f) => !folders.includes(f));

if (stale.length > 0) {
  console.log(`::warning::directoryOrder lists folders that do not exist: ${stale.join(', ')}`);
}
if (missing.length > 0) {
  console.log(`::error::metadata folders missing from metadata/.mj-sync.json directoryOrder: ${missing.join(', ')}`);
  console.log('Add each one after the folders its rows reference.');
  process.exit(1);
}
console.log(`All ${folders.length} metadata folders are listed in directoryOrder`);
NODE
