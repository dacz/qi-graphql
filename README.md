# QI - test your GraphQL

I felt pain with all the graphiql clones. Authorization and re-authorization is nightmare and I missed some other features, too (view headers, timings, possibility to save something from the result of one query and use it in subsequent or another query - like pagination token, etc.).

Currently only barebone cli available and highly opinionated - it serves my needs but I'm willing to make it much better, because I'm working on more projects.

And as you can see... very bare documentation and probably very buggy. Not ready for prime time but if you feel the same pain, I'm happy to cooperate and make it better.


## How to use it

`npm install -D qi-graphql`

Create folder for config

`mkdir .qi`

Create `settings.json` there (example):

```json
{
  "queries": ["queries/*.gql"],
  "vars": ["queries/*.vars.js"],
  "servers": {
    "myserver": {
      "url": "https://some/graphql"
    }
  },
  "clients": {
    "authLambda": {
      "server": "myserver",
      "default": true,
      "authorizer": {
        "source": "qi-cognito",
        "credentials": {
          "username": "xxxx",
          "password": "xxxx",
          "userPoolId": "xxxx",
          "clientId": "xxxx"
        }
      }
    },
  }
}
```

Create some queries in the folder `queries` (or any other but reflect `"queries"` section in settings). You can see some examples in the `examples/queries` folder in the repo.

Run the query

`qi query -q yourquery`

See `qi help` or `qi query help`.

More documentation to come.
