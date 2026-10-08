// pm2 config for the hosted MCP on the AntSeedStats production box. Only ever manage this app BY NAME
// (`pm2 restart antseed-mcp`), never `pm2 restart all`: the box also runs antseed-stats and antseed-worker.
//
// The API URL is the local Next process, not the public domain: no TLS round trip, no proxy in the loop, and
// the end client's IP travels in X-Real-IP so the API's per-IP budget still applies to the person asking.
module.exports = {
  apps: [
    {
      name: "antseed-mcp",
      script: "dist/index.js",
      args: "--http",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: "3200",
        ANTSEEDSTATS_API_URL: "http://127.0.0.1:3199",
        TRUST_PROXY: "1",
      },
      autorestart: true,
      max_restarts: 10,
      kill_timeout: 5000,
      max_memory_restart: "150M",
      time: true,
    },
  ],
};
