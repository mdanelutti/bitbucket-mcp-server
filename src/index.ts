import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

import { loadConfig } from './config.js';
import { BitbucketClient } from './bitbucket-client.js';
import { registerPullRequestTools } from './tools/pull-requests.js';

function createServer(config: ReturnType<typeof loadConfig>): McpServer {
  const server = new McpServer({
    name: 'bitbucket-mcp-server',
    version: '1.0.0',
  });

  const client = new BitbucketClient(config.username, config.apiToken);
  registerPullRequestTools(server, client, config);

  return server;
}

async function startStdio(config: ReturnType<typeof loadConfig>): Promise<void> {
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Bitbucket MCP server running on stdio');
}

async function startHttp(config: ReturnType<typeof loadConfig>): Promise<void> {
  const app = express();
  app.use(express.json());

  app.post('/mcp', async (req, res) => {
    const server = createServer(config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', server: 'bitbucket-mcp-server' });
  });

  app.listen(config.port, () => {
    console.error(`Bitbucket MCP server running on http://localhost:${config.port}/mcp`);
  });
}

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.transport === 'http') {
    await startHttp(config);
  } else {
    await startStdio(config);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
