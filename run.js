const cognito = require('./authorizers/cognito');
const { newServer, newClient } = require('./gqlClient');

const params = {
  url: 'https://48i5342ugb.execute-api.eu-west-1.amazonaws.com/dev/graphql',
  credentials: {
    username: 'tester',
    password: 'Heslo4545',
    userPoolId: 'eu-west-1_YHdLZsU46',
    clientId: '2lgv6k9ppeuiejnjkm1lbuksvu',
  },
};

const authorizer = cognito(params.credentials);
const server = newServer({ url: params.url });
const client = newClient({ server, authorizer });

const query = `
query device($id: ID!) {
  device(id: $id) {
    id
    name
  }
}
`;

const variables = { id: '173' };

client
  .qry({ query, variables })
  .then(rv => {
    console.log('RV body:', rv.body);
    console.log('RV timings:', rv.timings.phases);
    console.log('RV headers sent:', rv.req.headers);
    console.log('RV headers received:', rv.headers);
    console.log('RV body sent:', rv.req.body);
    console.log('RV body query sent:', rv.req.body.query);
    console.log('RV url called:', rv.requestUrl);
  })
  .catch(e => {
    console.log('ERROR:', e);
  });
