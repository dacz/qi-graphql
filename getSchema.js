const {
  introspectionQuery,
  buildClientSchema,
  printSchema,
} = require('graphql');

module.exports = async client => {
  const rv = await client.query({ query: introspectionQuery });
  if (rv instanceof Error) {
    return rv;
  }

  // if (rv.body.errors) console.error(JSON.stringify(rv.body.errors, null, 2));
  if (rv.body.data) {
    try {
      rv.body.data = printSchema(buildClientSchema(rv.body.data));
      // return {
      //   data: printSchema(buildClientSchema(rv.body.data)),
      //   errors: rv.body.errors,
      // };
    } catch (e) {
      return e;
    }
  }
  return rv;
};
