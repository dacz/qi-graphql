#!/usr/bin/env node

const command = require('yargs');
const m = require('./stateManager');
const pick = require('ramda/src/pick');
const inquirer = require('inquirer');
inquirer.registerPrompt(
  'autocomplete',
  require('inquirer-autocomplete-prompt')
);

// initiates mi managetInitiated
let mi;
const getMi = async () => {
  if (!mi) {
    mi = await m.init();
    return mi;
  }
  if (mi && typeof mi.then !== 'function') return mi;
  return await mi;
};

const query = async params => {
  // console.log('PARAMS', params);
  await getMi();

  let qp;
  let params2 = { ...params };
  for (let countLoop = 0; countLoop < 4; countLoop++) {
    if (countLoop > 2) {
      console.error('Something is wrong with gathering the input data');
      console.error('params:', JSON.stringify(params2, null, 2));
      console.error('qp:', JSON.stringify(qp, null, 2));
      process.exit(1);
    }
    qp = await mi.queryParams(params2);
    // console.log('QP:\n', JSON.stringify(qp, null, 2));
    if (qp instanceof Error) {
      console.error('queryParams failed', qp);
      process.exit(1);
    }
    if (qp.errors) {
      console.error('Errors:', qp.errors);
      process.exit(1); // todo should recover somehow - delete config and start over
    }
    if (!qp.select) break;
    // eslint-disable-next-line no-loop-func
    const questions = Object.keys(qp.select).map(k => ({
      name: k,
      source: (answersSoFar, input) =>
        Promise.resolve(
          qp.select[k].filter(i =>
            i.toLowerCase().match((input || '').toLowerCase())
          )
        ),
      type: 'autocomplete', // 'list'
      choices: qp.select[k],
    }));
    const answers = await inquirer.prompt(questions);
    params2 = { ...params2, ...answers };
  }

  const rv = await mi.query(qp.params);
  if (rv instanceof Error) {
    console.log('ERROR:', rv.message);
    if (params.printRequest) {
      console.log(
        `------------ REQUEST CONTENT -----------\n${JSON.stringify(
          rv.req,
          null,
          2
        )}`
      );
    }
    return;
  }

  if (params.outputFile && params.outputFile.length > 1) {
    const rvw = await m.writeJSONFile(params.outputFile, rv.body);
    if (rvw instanceof Error) {
      console.error('Write result failed:', rvw.message);
    }
  }

  console.log(
    `================ RESULT ================\n${JSON.stringify(
      rv.body,
      null,
      2
    )}`
  );
  if (params.printTimings) {
    console.log(
      `---------------- TIMINGS ----------------\n${JSON.stringify(
        pick(['request', 'firstByte', 'download', 'total'], rv.timings.phases),
        // rv.timings.phases,
        null,
        2
      )}`
    );
  }
  if (params.printRequest) {
    console.log(
      `------------ REQUEST CONTENT -----------\n${JSON.stringify(
        rv.req,
        null,
        2
      )}`
    );
  }
  if (params.printHeaders) {
    console.log(
      `------------ RESPONSE HEADERS -----------\n${JSON.stringify(
        rv.headers,
        null,
        2
      )}`
    );
  }
};

const getSchema = async params => {
  await getMi();
  const qp = await mi.queryParams(params);
  if (qp instanceof Error) {
    console.error('queryParams failed', qp);
    process.exit(1);
  }
  const rv = await mi.getSchema(qp.params);
  if (rv instanceof Error) {
    console.log('ERROR:', rv.message);
    return;
  }

  if (params.outputFile && params.outputFile.length > 1) {
    const rvw = await m.writePlainFile(params.outputFile, rv.body.data);
    if (rvw instanceof Error) {
      console.error('Write result failed:', rvw.message);
    }
  }

  console.log(`================ RESULT ================\n${rv.body.data}`);

  if (rv.body.errors && rv.body.errors.length > 0) {
    console.log(
      `============ RESULT ERRORS ============\n${JSON.stringify(
        rv.body.errors,
        null,
        2
      )}`
    );
  }
};

const pwait = fn =>
  fn()
    .then(r => r)
    .catch(e => console.error('error: ', e));

command // eslint-disable-line
  .usage(
    'Usage: $0 <command> [options]\nUse $0 <command> help to get help for the command'
  )
  .command(
    'query',
    'query with client',
    {
      c: {
        alias: 'client',
        describe: 'configured client to make the query with',
        type: 'string',
      },
      q: {
        alias: 'query',
        describe: 'query to call (its name)',
        type: 'string',
      },
      v: {
        alias: 'vars',
        describe: 'variables to be used (their name)',
        type: 'string',
      },
      h: {
        alias: 'printHeaders',
        describe: 'print response headers',
        type: 'boolean',
      },
      r: {
        alias: 'printRequest',
        describe: 'print request content',
        type: 'boolean',
      },
      t: {
        alias: 'printTimings',
        describe: 'print timings info',
        type: 'boolean',
      },
      o: {
        alias: 'outputFile',
        describe: 'print successful result to file',
        type: 'string',
      },
      i: {
        alias: 'interactive',
        describe: 'opens the graphiql UI',
        type: 'boolean',
      },
    },
    argv => {
      if (argv.i) {
        console.error('interactive mode not implemented, yet');
        return;
      }
      pwait(() => query(argv));
    }
  )
  .command(
    'schema',
    'get the schema from the server',
    {
      c: {
        alias: 'client',
        describe: 'use configured client to make the introspection query with',
        type: 'string',
      },
    },
    argv => {
      // const client = makeClient(argv.client);
      pwait(() => getSchema(argv));
    }
  )
  // .example(
  //   '$0 query -c client -q query -v vars',
  //   'call graphql endpoint with configured client, specified query and supplied vars (name)'
  // )
  .help().argv;
//
