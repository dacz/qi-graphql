const {
  makeGraphQLRequestBody,
  stateVariablesObj,
  variablesWithStateVars,
  procDirectives,
} = require('./gqlUtils');
const got = require('got');
const { safeAsync } = require('./utils');
const mergeDeepLeft = require('ramda/src/mergeDeepLeft');
const pathOr = require('ramda/src/pathOr');
const path = require('path');

// easier than all check if defined
const dummyCache = {
  set: () => {},
  get: () => {},
  setSave: () => {},
  save: () => {},
};

const newServer = params => {
  if (!params.url) throw new Error('missing url in newServer');
  const defaultParams = {
    baseUrl: params.url,
    headers: params.headers,
    json: true,
    timeout: params.timeout || 10000, // millis
    retry: 0,
    followRedirect: false,
  };
  return { defaultParams };
};
module.exports.newServer = newServer;

// params from settings / cache (scoped cache!)
const newClient = async (params, name, cache = dummyCache) => {
  const mergedParams = mergeDeepLeft(
    params,
    cache.get(['clients', name]) || {}
  );

  if (!mergedParams.server) throw new Error('missing server in newClient');
  const server = mergedParams.server;
  let state = mergedParams.state;

  const authorizer = mergedParams.authorizer;
  if (authorizer) {
    if (!authorizer.source) return new Error('authorizer without source');
    let authFn;
    try {
      authFn = authorizer.source.match(/^\./)
        ? require(path.join(process.cwd(), authorizer.source)) // eslint-disable-line
        : authorizer.source.match(/^qi-/)
        ? require(`./authorizers/${authorizer.source.replace(/^\qi-/, '')}`) // eslint-disable-line
        : require(authorizer.source); // eslint-disable-line
    } catch (e) {
      console.log('CWD', process.cwd());
      console.log('SOURCE:', authorizer.source);
      return new Error(`require authorizer source failed: ${e.message}`);
    }
    authorizer.fn = authFn(authorizer.credentials);
    if (
      !authorizer.fn.authorize ||
      typeof authorizer.fn.authorize !== 'function'
    ) {
      return new Error(
        'authorizer function do not contain authorize method or it is not a function'
      );
    }
    if (
      !authorizer.fn.requestEnhance ||
      typeof authorizer.fn.requestEnhance !== 'function'
    ) {
      return new Error(
        'authorizer function do not contain requestEnhance method or it is not a function'
      );
    }
    authorizer.tries = authorizer.tries || 0;
    authorizer.called = authorizer.called || 0;
    authorizer.status = authorizer.status || undefined;
    await cache.setSave(['clients', name, 'authorizer'], authorizer);
  }

  const authorize = async () => {
    if (!authorizer) {
      return new Error('Calling authorize on client without authorizer');
    }
    authorizer.parameters = await authorizer.fn.authorize();
    authorizer.called = authorizer.called + 1;
    authorizer.lastCalled = new Date().toISOString();

    if (authorizer.parameters instanceof Error) {
      console.error('Authorize unsuccessful: ', authorizer.parameters.message);
      authorizer.tries = authorizer.tries + 1;
      authorizer.lastError = new Date().toISOString();
      authorizer.status = authorizer.parameters;
      authorizer.parameters = undefined;
      await cache.setSave(['clients', name, 'authorizer'], authorizer);
      return authorizer.status;
    }
    authorizer.tries = 0;
    authorizer.lastSuccess = new Date().toISOString();
    authorizer.status = 'ok';
    await cache.setSave(['clients', name, 'authorizer'], authorizer);
    return 'ok';
  };

  // qparams: { query, variables }
  const query = async qparams => {
    const stateVarsObj = stateVariablesObj(qparams.query, name, cache);
    // console.log('stateVarsObj', stateVarsObj);
    const paramsDirectiveOut = procDirectives(qparams.query);
    const varsWithStateVars = variablesWithStateVars(
      qparams.variables,
      name,
      cache
    );
    // console.log('varsWithStateVars', varsWithStateVars);

    let req = {
      body: makeGraphQLRequestBody({
        query: paramsDirectiveOut ? paramsDirectiveOut.query : qparams.query,
        variables: stateVarsObj
          ? mergeDeepLeft(varsWithStateVars, stateVarsObj)
          : varsWithStateVars,
      }),
    };

    if (authorizer) {
      req = authorizer.fn.requestEnhance(req, authorizer.parameters);
    }

    // req.headers['X-Photon-loglevel'] = 'debug';
    // console.log('REQ.headers', req.headers);

    const rv = await safeAsync(() => got.extend(server.defaultParams)('', req));
    if (rv instanceof Error) {
      console.log('query response error', rv.message);
      if (rv.statusCode === 401) {
        if (authorizer && authorizer.tries < 1) {
          // try to authorize
          console.log('calling authorize');
          const authRv = await authorize();
          if (!(authRv instanceof Error)) {
            console.log('authorize success');
            return query(qparams);
          }
          rv.AUTHORIZATION_ALREADY_TRIED = true;
        }
      }
      // console.log('ERROR: RESPONSE:', rv.body);
      rv.req = req;
      return rv;
    }

    if (paramsDirectiveOut && paramsDirectiveOut.extract && rv.body.data) {
      const varsToState = paramsDirectiveOut.extract.reduce(
        (acc, { responsePath, name: nm }) => {
          acc[nm] = pathOr(undefined, responsePath, rv.body.data);
          return acc;
        },
        {}
      );
      state = { ...state, ...varsToState };
      await cache.setSave(['clients', name, 'state'], state);
    }
    rv.req = req;
    return rv;
  };

  return {
    query,
    authorize,
    authorizerInfo: () => authorizer,
    serverInfo: () => server,
    getState: () => state,
  };
};
module.exports.newClient = newClient;
