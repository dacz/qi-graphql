const { parse, print, visit } = require('graphql');
const pick = require('ramda/src/pick');
const assocPath = require('ramda/src/assocPath');

// operation (gql or string)
const getOperationName = operation => {
  const parsedOperation =
    typeof operation === 'string' ? parse(operation) : operation;

  const operationDefinition = (parsedOperation.definitions || []).filter(
    i => i.kind === 'OperationDefinition'
  );
  if (operationDefinition.length < 1) {
    throw new Error(
      `Error: operation has not operation definition: ${print(operation)}`
    );
  }

  return (
    (operationDefinition &&
      operationDefinition[0] &&
      operationDefinition[0].name &&
      operationDefinition[0].name.value) ||
    null
  );
};

const makeGraphQLRequestBody = ({ query, variables = null }) => ({
  operationName: getOperationName(query),
  query: typeof query === 'string' ? query : print(query),
  variables,
});

const varsInQuery = query => {
  const pq = typeof query === 'string' ? parse(query) : query;
  const varDefs = new Set();
  visit(pq, {
    Variable: i => {
      varDefs.add(i.name.value);
    },
  });
  return [...varDefs];
};

const STATE_PREFIX = '__STATE__';
const FROM_STATE_PATTERN = new RegExp(`^${STATE_PREFIX}`);
const whichVars = arr =>
  !arr
    ? {}
    : arr.reduce(
      (acc, i) => {
        if (i.match(FROM_STATE_PATTERN)) {
          acc.fromState.push(i.replace(FROM_STATE_PATTERN, ''));
        } else {
          acc.fromOutside.push(i);
        }
        return acc;
      },
      { fromState: [], fromOutside: [] }
    );

const usedStateVariables = query => whichVars(varsInQuery(query)).fromState;

const renameKeys = obj =>
  Object.keys(obj).reduce((acc, k) => {
    acc[`${STATE_PREFIX}${k}`] = obj[k];
    return acc;
  }, {});

const destructureKeys = obj =>
  Object.keys(obj).reduce((acc, k) => assocPath(k.split('.'), obj[k], acc), {});

const stateVariablesObj = (query, clientName, cache) => {
  const arr = usedStateVariables(query);
  if (arr.length === 0) return {};
  return destructureKeys(
    renameKeys(pick(arr, cache.get(['clients', clientName, 'state']) || {}))
  );
};

const variablesWithStateVars = (obj, clientName, cache) => {
  if (!obj) return obj;
  const okeys = Object.keys(obj);
  if (okeys.length === 0) return obj;
  return okeys.reduce((acc, k) => {
    if (Array.isArray(obj[k])) {
      acc[k] = obj[k];
      return acc;
    }
    if (typeof obj[k] === 'string' && obj[k].match(FROM_STATE_PATTERN)) {
      const skey = obj[k].replace(FROM_STATE_PATTERN, '');
      acc[k] = cache.get(['clients', clientName, 'state', skey]);
      return acc;
    }
    if (typeof obj[k] === 'object') {
      acc[k] = variablesWithStateVars(obj[k], clientName, cache);
      return acc;
    }
    acc[k] = obj[k];
    return acc;
  }, {});
};

const usedOutsideVariables = query => whichVars(varsInQuery(query)).fromOutside;

const procDirectives = query => {
  const pq = typeof query === 'string' ? parse(query) : query;
  const directives = [];
  const rv = visit(pq, {
    Directive: (i, _key, _parent, path, ancestors) => {
      if (i.name.value === 'setParameter') {
        // directive we are interested in
        const name = i.arguments[0].value.value;
        // last is the directive itself
        const v = path.slice(0, -1).reduce(
          (acc, ii) => {
            acc.path.push({
              ...(typeof ii === 'number'
                ? { idx: ii }
                : {
                  kind: acc.tree.kind,
                  nv:
                      (acc.tree.alias && acc.tree.alias.value) ||
                      (acc.tree.name && acc.tree.name.value),
                }),
            });
            acc.tree = acc.tree[ii];
            return acc;
          },
          { tree: ancestors[0], path: [], name }
        );
        delete v.tree;
        directives.push(v);
        return null;
      }
      return true;
    },
  });
  // console.log('directives', directives);
  const extract =
    directives.length === 0
      ? []
      : directives
        .map(d =>
          d.path.reduce(
            (acc, i) => {
              // first field will make it (before this are op defs etc.)
              if (i.kind === 'Field') acc.pathRec = true;
              if (acc.pathRec) {
                if (i.nv) {
                  acc.responsePath.push(i.nv);
                  return acc;
                }
              }
              return acc;
            },
            { pathRec: false, responsePath: [], name: d.name }
          )
        )
        .map(i => {
          delete i.pathRec;
          return i;
        });
  return { query: print(rv), extract };
};

module.exports = {
  getOperationName,
  makeGraphQLRequestBody,
  varsInQuery,
  whichVars,
  usedStateVariables,
  stateVariablesObj,
  variablesWithStateVars,
  usedOutsideVariables,
  procDirectives,
};
