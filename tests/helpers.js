'use strict';
const fs = require('fs');
const path = require('path');
const parser = require('../js/core/parser.js');

function loadV03() {
  const md = fs.readFileSync(path.join(__dirname, '..', 'samples', 'lorebook_v03.md'), 'utf8');
  return parser.toLorebook(parser.parseMarkdown(md));
}

function entryByTitle(lb, title) {
  return lb.entries.find((e) => e.title === title);
}

function lb(entries, extra) {
  return Object.assign({ id: 'lb', name: 'test', version: '', entries: entries.map((e, i) => Object.assign({ id: 'e' + i, no: '', title: 'T' + i, body: '' }, e)) }, extra || {});
}

module.exports = { loadV03, entryByTitle, lb };
