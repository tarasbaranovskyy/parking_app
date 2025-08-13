# Node.js template

This is a Node.js project with an HTTP server.

Add your [configuration](https://codesandbox.io/docs/projects/learn/setting-up/tasks) to optimize it for [CodeSandbox](https://codesandbox.io).

## Configuration

### Allowed Origins

Set the `ALLOWED_ORIGINS` environment variable to a comma-separated list of URLs that are permitted to access the server. Requests from origins not in this list will be rejected.

Example:

```bash
ALLOWED_ORIGINS="https://example.com,http://localhost:3000" npm start
```

## How does this work?

We run `yarn start` to start an HTTP server that runs on http://localhost:8080. You can open new or existing devtools with the + button next to the devtool tabs.

## Resources

- [CodeSandbox — Docs](https://codesandbox.io/docs)
- [CodeSandbox — Discord](https://discord.gg/Ggarp3pX5H)
