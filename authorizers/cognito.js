global.fetch = require('node-fetch');
const AmazonCognitoIdentity = require('amazon-cognito-identity-js');

// { usernama, password, poolId, clientId }
const authorizer = params => {
  const { username, password, userPoolId, clientId } = params;
  if (!username) throw new Error('cognitoLogin: missing username');
  if (!password) throw new Error('cognitoLogin: missing password');
  if (!userPoolId) throw new Error('cognitoLogin: missing poolId');
  if (!clientId) throw new Error('cognitoLogin: missing clientId');

  const authenticationData = {
    Username: username,
    Password: password,
  };
  const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(
    authenticationData
  );
  const poolData = {
    UserPoolId: userPoolId,
    ClientId: clientId,
  };
  const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
  const userData = {
    Username: username,
    Pool: userPool,
  };
  const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
  const status = {
    authorized: false,
    token: undefined,
  };

  const getToken = () =>
    new Promise(res =>
      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess(result) {
          status.token = result.idToken.jwtToken;
          status.authorized = true;
          res(status.token);
        },

        onFailure(err) {
          // { code: 'NotAuthorizedException',
          // name: 'NotAuthorizedException',
          // message: 'Incorrect username or password.' }
          const e = new Error(err.message);
          status.authorized = e;
          status.token = undefined;
          res(e);
        },

        mfaRequired() {
          const e = new Error('MFA required but currently not supported');
          status.authorized = e;
          status.token = undefined;
          res(e);
        },
      })
    );

  return {
    authorize: async () => {
      const rv = await getToken();
      if (rv instanceof Error) return rv;
      return {
        Authorization: rv,
      };
    },
    requestEnhance: (req, parameters) => {
      if (!parameters) return req;
      req.headers = { ...(req.headers || {}), ...parameters };
      return req;
    },
    getToken,
  };
};
module.exports = authorizer;
