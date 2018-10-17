const { safeReadFile, assocPathS } = require('./utils');
const path = require('path');
const globby = require('globby');
const { newServer, newClient } = require('./gqlGetter');
const { usedOutsideVariables } = require('./gqlUtils');
const getGQLSchema = require('./getSchema');
const dbFactory = require('./jsondb');

const exit = code => {
  console.log('quitting...');
  process.exit(code || 1);
};

const readGlob = async (spec, stripSuffix) => {
  const files = await globby(spec); // , { cwd: '.' });
  const rs = stripSuffix ? new RegExp(`${stripSuffix}$`) : undefined;
  const names = files.reduce((acc, i) => {
    const name = stripSuffix
      ? path.parse(i).name.replace(rs, '')
      : path.parse(i).name;
    acc[name] = {
      file: i,
    };
    return acc;
  }, {});
  return { files, names };
};

const getDefault = obj => Object.keys(obj).find(k => obj[k].default);

// ------------------------->>>>>>>>>>>>
const init = async () => {
  // init cache
  const cache = await dbFactory({
    filename: '.qi/cache.json',
    name: 'cache',
    createIfNotExists: true,
  });
  // console.log('CACHE', cache);
  if (cache instanceof Error) {
    console.error('Problem with reading/writing cache:', cache.message);
    exit(1);
  }
  // init settings
  const settings = await dbFactory({
    filename: '.qi/settings.json',
    name: 'settings',
  });
  if (settings instanceof Error) {
    console.error('Problem with reading settings:', settings.message);
    exit(1);
  }

  // read queries
  const queries = await readGlob(settings.get('queries'));
  // todo should parse them to get top level name if any (batch?) and add to meta
  cache.set('queries', queries);

  // read vars
  const vars = await readGlob(settings.get('vars'), '.vars');
  cache.set('vars', vars);

  // cache save
  const csaved = await cache.save();
  if (csaved instanceof Error) {
    console.error('Problem with writing cache:', csaved.message);
    exit(1); // should return kind of fatal error?
  }

  // load servers from settings
  const settingsServers = settings.get('servers');
  if (!settingsServers || typeof settingsServers !== 'object') {
    console.error('No servers in the settings.');
    exit(1);
  }
  const servers = Object.keys(settingsServers).reduce((acc, k) => {
    acc[k] = newServer(settingsServers[k]);
    return acc;
  }, {});
  // console.log('SERVERS', servers);

  // add clients from settings
  const settingsClients = settings.get('clients');
  if (!settingsClients || typeof settingsClients !== 'object') {
    console.error('No clients in the settings.');
    exit(1);
  }
  const clients = {};
  for (const k of Object.keys(settingsClients)) {
    if (!settingsClients[k].server) {
      console.error(
        `Client "${k}" specifies non existing server "${
          settingsClients[k].server
        }"`
      );
      exit(1);
    }

    clients[k] = await newClient(
      {
        ...settingsClients[k],
        server: servers[settingsClients[k].server],
      },
      k,
      cache
    );
    if (settingsClients[k].default) {
      clients.default = clients[k];
    }
  }

  // console.log('CLIENTS:::', clients);

  const queryParams = async ({ client, query, vars: v }) => {
    const c =
      client ||
      (Object.keys(settingsClients).length === 1 &&
        Object.keys(settingsClients)[0]) ||
      getDefault(settingsClients);
    let out = {};
    if (!c) {
      return assocPathS('select.client', Object.keys(clients), out);
    }
    if (!clients[c]) {
      return assocPathS('errors.client', `Client: "${c}" does not exist`, out);
    }
    if (clients[c] instanceof Error) {
      console.error(`Client has a error: "${clients[c].message}"`);
      return exit(1);
    }
    out = assocPathS('params.client', { name: c, client: clients[c] }, out);

    // query
    if (!query) {
      return assocPathS('select.query', Object.keys(queries.names), out);
    }
    if (!queries.names[query]) {
      return assocPathS(
        'errors.query',
        `Query: "${query}" does not exist`,
        out
      );
    }
    const queryContent = await safeReadFile(queries.names[query].file);
    if (queryContent instanceof Error) {
      console.error(
        `Error reading file with query "${queries.names[query].file}"`
      );
      return exit(1);
    }
    out = assocPathS(
      'params.query',
      { name: query, content: queryContent },
      out
    );

    // vars should depend on the query if it needs vars at all
    const neededFromOutside = usedOutsideVariables(queryContent);
    // console.log('NEEDEDFROMOUT', neededFromOutside);
    if (neededFromOutside.length === 0) {
      if (v) {
        out = assocPathS(
          'warnings.vars',
          'Variables specified but not needed',
          out
        );
      }
      return assocPathS('params.vars', { data: null }, out);
    }

    // console.log('HERE1');
    // console.log('query', query);
    if (!vars.names[query]) {
      console.log('vars.names[query]', vars.names[query]);
      return assocPathS(
        'errors.vars',
        `Variables file with name: "${query}" does not exist`,
        out
      );
    }

    // eslint-disable-next-line
    vars.names[query].data = require(path.join(
      process.cwd(),
      `./${vars.names[query].file}`
    ));
    // console.log('vars.names[query].data', vars.names[query].data);
    if (v) {
      const vv = vars.names[query].data[v];
      if (!vv) {
        out = assocPathS(
          'errors.vars',
          `Variables with name: "${v}" in the basefilename "${query}" does not exist`,
          out
        );
        return assocPathS(
          'select.vars',
          Object.keys(vars.names[query].data),
          out
        );
      }
      return assocPathS('params.vars', { name: v, data: vv }, out);
    }

    // case when only one variables in file
    const possibleVars = Object.keys(vars.names[query].data);
    if (possibleVars.length === 1) {
      out = assocPathS(
        'warnings.vars',
        `Variables not specified, using the only one "${
          possibleVars[0]
        }" in basefilename "${query}"`,
        out
      );
      return assocPathS(
        'params.vars',
        {
          name: possibleVars[0],
          data: vars.names[query].data[possibleVars[0]],
        },
        out
      );
    }
    return assocPathS('select.vars', possibleVars, out);
  };

  // qp => queryParams.params
  const query = async qp => {
    if (!qp.client.client || !qp.query.content) {
      return null;
    }
    // console.log('QP', qp);
    return await qp.client.client.query({
      query: qp.query.content,
      variables: qp.vars.data,
    });
  };

  const getSchema = async qp => {
    if (!qp.client.client) {
      return null;
    }
    const rv = await getGQLSchema(qp.client.client);
    // console.log('RV', rv);

    const schema = {
      content: rv.body && rv.body.data,
      status:
        rv.body && rv.body.errors && rv.body.errors.length > 0
          ? rv.body.errors
          : 'ok',
      ts: new Date().toISOString(),
    };
    const rvw = await cache.setSave('schema', schema);
    if (rvw instanceof Error) {
      console.error('Write cache failed:', rvw);
      exit(0);
    }

    return rv;
  };

  return {
    queryParams,
    cache,
    settings,
    clients,
    query,
    getSchema,
  };
};
module.exports.init = init;
