// Entry point for `node --test scripts/`: Node runs the directory as one test file, and this loads every *.test.mjs in it.
// Serves the exit criteria of order D (design 7.2 guard tests, contract check tests).
const fs = require('node:fs');
const path = require('node:path');
for (const f of fs.readdirSync(__dirname).filter((n) => n.endsWith('.test.mjs')).sort()) import(path.join(__dirname, f));
