const {
  safeReadFile,
  safeWriteFile,
  pathS,
  assocPathS,
  safeParseJSON,
} = require('./utils');

// init
// config { filename, name, createIfNotExists }
module.exports = async config => {
  let db = {};
  const dbMeta = config;
  const read = async () => safeParseJSON(await safeReadFile(dbMeta.filename));
  const save = () =>
    safeWriteFile(dbMeta.filename, JSON.stringify(db, null, 2));

  let rv = await read();
  if (rv instanceof Error) {
    if (rv.code === 'ENOENT' && dbMeta.createIfNotExists) {
      console.log(`create new ${config.name}`);
      rv = await save();
      if (rv instanceof Error) return rv;
    } else {
      console.log('Error creating cache:', rv.message);
      return rv;
    }
  }
  db = rv;

  return {
    get: what => (what ? pathS(what, db) : db),
    setSave: async (what, value) => {
      db = what ? assocPathS(what, value, db) : value;
      return await save();
    },
    set: (what, value) => {
      db = what ? assocPathS(what, value, db) : value;
    },
    save,
  };
};
