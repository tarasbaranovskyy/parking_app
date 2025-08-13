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

### State Persistence

The serverless API uses [Upstash Redis](https://upstash.com/) to persist parking state between requests. Configure the connection using the following environment variables:

- `UPSTASH_REDIS_REST_URL` – REST endpoint of your Upstash Redis database.
- `UPSTASH_REDIS_REST_TOKEN` – authorization token for the database.

You can define these values in a `.env` file:

```env
UPSTASH_REDIS_REST_URL=https://<region>.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

These variables enable the API to store and retrieve state from Redis, ensuring data survives across serverless invocations.

## How does this work?

We run `yarn start` to start an HTTP server that runs on http://localhost:8080. You can open new or existing devtools with the + button next to the devtool tabs.

## Resources

- [CodeSandbox — Docs](https://codesandbox.io/docs)
- [CodeSandbox — Discord](https://discord.gg/Ggarp3pX5H)
