const fs = require('node:fs');
const path = require('node:path');

exports.setup = function () {};

exports.up = function (db) {
  return readSql('up').then((sql) => db.runSql(sql));
};

exports.down = function (db) {
  return readSql('down').then((sql) => db.runSql(sql));
};

function readSql(direction) {
  return fs.promises.readFile(
    path.join(__dirname, 'sqls', `20260730140000-conversation-owners-${direction}.sql`),
    'utf8',
  );
}

exports._meta = { version: 1 };
