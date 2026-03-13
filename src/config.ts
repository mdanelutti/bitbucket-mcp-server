export interface Config {
  username: string;
  apiToken: string;
  defaultWorkspace?: string;
  enableDangerous: boolean;
  transport: 'stdio' | 'http';
  port: number;
}

export function loadConfig(): Config {
  const username = process.env.BITBUCKET_USERNAME;
  const apiToken = process.env.BITBUCKET_API_TOKEN;

  if (!username || !apiToken) {
    throw new Error(
      'Missing required environment variables: BITBUCKET_USERNAME and BITBUCKET_API_TOKEN must be set'
    );
  }

  return {
    username,
    apiToken,
    defaultWorkspace: process.env.BITBUCKET_WORKSPACE || undefined,
    enableDangerous: process.env.BITBUCKET_ENABLE_DANGEROUS === 'true',
    transport: (process.env.TRANSPORT as 'stdio' | 'http') || 'stdio',
    port: parseInt(process.env.PORT || '3000', 10),
  };
}
