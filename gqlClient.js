const { makeGraphQLRequestBody } = require('./gqlUtils');
const got = require('got');
const { safeAsync } = require('./utils');

const newServer = params => {
  if (!params.url) return new Error('missing url in newServer');
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

const newClient = params => {
  if (!params.server) return new Error('missing server in newClient');
  const server = params.server;
  const authorizer = params.authorizer;

  if (authorizer) {
    if (typeof authorizer.authorize !== 'function')
      return new Error('authorizer.authorize is not a function');
    if (typeof authorizer.requestEnhance !== 'function')
      return new Error('authorizer.requestEnhance is not a function');

    authorizer.tries = authorizer.tries || 0;
    authorizer.called = authorizer.called || 0;
    authorizer.maxCalls = authorizer.maxCalls || 1;
    authorizer.status = authorizer.status || undefined;
  }

  const authorize = async () => {
    if (!authorizer) {
      return new Error('Calling authorize on client without authorizer');
    }
    authorizer.authRes = await authorizer.authorize();
    authorizer.called = authorizer.called + 1;
    authorizer.lastCalled = new Date().toISOString();

    if (authorizer.authRes instanceof Error) {
      console.error('Authorize unsuccessful: ', authorizer.authRes.message);
      authorizer.tries = authorizer.tries + 1;
      authorizer.lastError = new Date().toISOString();
      authorizer.status = authorizer.authRes;
      authorizer.authRes = undefined;
      return authorizer.status;
    }
    authorizer.tries = 0;
    authorizer.lastSuccess = new Date().toISOString();
    authorizer.status = 'ok';
    return 'ok';
  };

  // qv: { query, variables }
  const qry = async ({ query, variables }) => {
    let req = {
      body: makeGraphQLRequestBody({
        query,
        variables,
      }),
    };

    if (authorizer) {
      req = authorizer.requestEnhance(req, authorizer.authRes);
    }

    const rv = await safeAsync(() => got.extend(server.defaultParams)('', req));
    if (rv instanceof Error) {
      console.log('query response error', rv.message);
      if (rv.statusCode === 401) {
        console.log('authorizer', authorizer);
        if (authorizer && authorizer.tries < authorizer.maxCalls) {
          // try to authorize
          console.log('calling authorize');
          const authRv = await authorize();
          if (!(authRv instanceof Error)) {
            console.log('authorize success');
            return qry({ query, variables });
          }
          rv.AUTHORIZATION_MAX_TRIES_EXHAUSTED = true;
        }
      }
      rv.req = req;
      return rv;
    }

    rv.req = req;
    return rv;
  };

  return {
    qry,
    authorize,
    authorizer: () => authorizer,
    server: () => server,
  };
};
module.exports.newClient = newClient;
