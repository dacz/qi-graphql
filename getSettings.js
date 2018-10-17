const globby = require('globby');
const settings = require('./.qi/settings.json');

const queries = settings.queries
  ? globby.sync(settings.queries, { ignore: ['node_modules/**'] })
  : 'NO QUERIES';
console.log('QUERIES:', queries);

const servers = settings.servers || 'NO SERVERS';
console.log('SERVERS:', servers);

const clients = settings.clients || 'NO CLIENTS';
console.log('CLIENTS:', clients);
