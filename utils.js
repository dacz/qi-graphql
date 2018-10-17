const fs = require('fs');
const util = require('util');
const path = require('path');
const pathOr = require('ramda/src/pathOr');
const assocPath = require('ramda/src/assocPath');

const safeAsync = async fn => {
  try {
    return await fn();
  } catch (e) {
    return e;
  }
};

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const safeParseJSON = str => {
  if (str instanceof Error) return str;
  try {
    return JSON.parse(str);
  } catch (e) {
    return e;
  }
};

const safeReadFile = async fname => {
  try {
    return (await readFile(path.join(process.cwd(), fname))).toString();
  } catch (e) {
    // 'ENOENT'
    return Promise.resolve(e);
  }
};

const safeWriteFile = (fname, content) => {
  try {
    return writeFile(fname, content);
  } catch (e) {
    return Promise.resolve(e);
  }
};

const pathS = (p, obj) =>
  typeof p === 'string'
    ? pathOr(undefined, p.split('.'), obj)
    : pathOr(undefined, p, obj);

const assocPathS = (p, val, obj) =>
  typeof p === 'string'
    ? assocPath(p.split('.'), val, obj)
    : assocPath(p, val, obj);

module.exports = {
  safeAsync,
  readFile,
  writeFile,
  safeParseJSON,
  safeReadFile,
  safeWriteFile,
  pathS,
  assocPathS,
};
