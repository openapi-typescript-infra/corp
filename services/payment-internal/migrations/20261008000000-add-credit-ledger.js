'use strict';
const fs = require('node:fs');
const path = require('node:path');

exports.up = (db) =>
  db.runSql(
    fs.readFileSync(path.join(__dirname, 'sqls', '20261008000000-add-credit-ledger-up.sql'), 'utf8'),
  );
exports.down = (db) =>
  db.runSql(
    fs.readFileSync(path.join(__dirname, 'sqls', '20261008000000-add-credit-ledger-down.sql'), 'utf8'),
  );
exports._meta = { version: 1 };
