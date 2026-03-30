import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BitbucketClient } from '../bitbucket-client.js';
import type { Config } from '../config.js';
import type {
  BitbucketUser,
  BitbucketPullRequest,
  BitbucketComment,
  BitbucketActivity,
  PaginatedResponse,
} from '../types.js';

function prBasePath(workspace: string, repoSlug: string): string {
  return `/repositories/${workspace}/${repoSlug}/pullrequests`;
}

function formatPrSummary(pr: BitbucketPullRequest): string {
  return [
    `#${pr.id}: ${pr.title}`,
    `State: ${pr.state}`,
    `Author: ${pr.author.display_name}`,
    `Branch: ${pr.source.branch.name} -> ${pr.destination.branch.name}`,
    `Created: ${pr.created_on}`,
    `Comments: ${pr.comment_count} | Tasks: ${pr.task_count}`,
    `URL: ${pr.links.html.href}`,
  ].join('\n');
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export function registerPullRequestTools(
  server: McpServer,
  client: BitbucketClient,
  config: Config
): void {
  const workspaceParam = config.defaultWorkspace
    ? z.string().default(config.defaultWorkspace).describe('Bitbucket workspace slug')
    : z.string().describe('Bitbucket workspace slug');

  // ─── READ TOOLS ────────────────────────────────────────────

  server.tool(
    'list_pull_requests',
    'List pull requests for a repository',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      state: z
        .enum(['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'])
        .default('OPEN')
        .describe('PR state filter'),
    },
    async ({ workspace, repo_slug, state }) => {
      const prs = await client.getPaginated<BitbucketPullRequest>(
        `${prBasePath(workspace, repo_slug)}?state=${state}`
      );
      if (prs.length === 0) {
        return textResult(`No ${state} pull requests found in ${workspace}/${repo_slug}`);
      }
      const summary = prs.map(formatPrSummary).join('\n\n---\n\n');
      return textResult(`Found ${prs.length} ${state} pull request(s):\n\n${summary}`);
    }
  );

  server.tool(
    'get_pull_request',
    'Get details of a specific pull request',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      pr_id: z.number().describe('Pull request ID'),
    },
    async ({ workspace, repo_slug, pr_id }) => {
      const pr = await client.get<BitbucketPullRequest>(
        `${prBasePath(workspace, repo_slug)}/${pr_id}`
      );
      const reviewers = pr.reviewers.map((r) => r.display_name).join(', ') || 'None';
      const participants = pr.participants
        .map((p) => `${p.user.display_name} (${p.role}${p.approved ? ', approved' : ''}${p.state === 'changes_requested' ? ', changes requested' : ''})`)
        .join('\n  ');

      const detail = [
        formatPrSummary(pr),
        `\nDescription:\n${pr.description || '(no description)'}`,
        `\nReviewers: ${reviewers}`,
        `Participants:\n  ${participants || 'None'}`,
        `Close source branch: ${pr.close_source_branch}`,
      ].join('\n');

      return textResult(detail);
    }
  );

  server.tool(
    'get_pull_request_diff',
    'Get the diff of a pull request',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      pr_id: z.number().describe('Pull request ID'),
    },
    async ({ workspace, repo_slug, pr_id }) => {
      const diff = await client.getRaw(
        `${prBasePath(workspace, repo_slug)}/${pr_id}/diff`
      );
      return textResult(diff);
    }
  );

  server.tool(
    'get_pull_request_comments',
    'List comments on a pull request',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      pr_id: z.number().describe('Pull request ID'),
    },
    async ({ workspace, repo_slug, pr_id }) => {
      const comments = await client.getPaginated<BitbucketComment>(
        `${prBasePath(workspace, repo_slug)}/${pr_id}/comments`
      );
      if (comments.length === 0) {
        return textResult('No comments on this pull request');
      }

      const formatted = comments
        .filter((c) => !c.deleted)
        .map((c) => {
          const location = c.inline
            ? ` [inline: ${c.inline.path}${c.inline.to ? `:${c.inline.to}` : ''}]`
            : '';
          const parent = c.parent ? ` (reply to #${c.parent.id})` : '';
          return `Comment #${c.id} by ${c.user.display_name}${location}${parent}:\n${c.content.raw}`;
        })
        .join('\n\n---\n\n');

      return textResult(`${comments.length} comment(s):\n\n${formatted}`);
    }
  );

  server.tool(
    'get_pull_request_activity',
    'Get the activity log of a pull request',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      pr_id: z.number().describe('Pull request ID'),
    },
    async ({ workspace, repo_slug, pr_id }) => {
      const activities = await client.getPaginated<BitbucketActivity>(
        `${prBasePath(workspace, repo_slug)}/${pr_id}/activity`
      );
      if (activities.length === 0) {
        return textResult('No activity on this pull request');
      }

      const formatted = activities
        .map((a) => {
          if (a.update) {
            return `[${a.update.date}] ${a.update.author.display_name} updated: state=${a.update.state}`;
          }
          if (a.approval) {
            return `[${a.approval.date}] ${a.approval.user.display_name} approved`;
          }
          if (a.comment) {
            return `[${a.comment.created_on}] ${a.comment.user.display_name} commented: ${a.comment.content.raw.slice(0, 100)}`;
          }
          return '[unknown activity]';
        })
        .join('\n');

      return textResult(`Activity log:\n\n${formatted}`);
    }
  );

  server.tool(
    'search_workspace_members',
    'Search for workspace members by display name. Useful for finding reviewer UUIDs.',
    {
      workspace: workspaceParam,
      query: z.string().describe('Display name (or part of it) to search for'),
    },
    async ({ workspace, query }) => {
      const members = await client.getPaginated<{ user: BitbucketUser }>(
        `/workspaces/${workspace}/members`
      );

      const queryLower = query.toLowerCase();
      const matches = members.filter((m) =>
        m.user.display_name.toLowerCase().includes(queryLower)
      );

      if (matches.length === 0) {
        return textResult(`No members found matching "${query}" in workspace ${workspace}`);
      }

      const formatted = matches
        .map((m) => `- ${m.user.display_name} | UUID: ${m.user.uuid} | Nickname: ${m.user.nickname ?? 'N/A'}`)
        .join('\n');

      return textResult(`Found ${matches.length} member(s) matching "${query}":\n\n${formatted}`);
    }
  );

  // ─── WRITE TOOLS ───────────────────────────────────────────

  server.tool(
    'create_pull_request',
    'Create a new pull request',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      title: z.string().describe('PR title'),
      source_branch: z.string().describe('Source branch name'),
      destination_branch: z.string().optional().describe('Destination branch (defaults to repo main branch)'),
      description: z.string().optional().describe('PR description (markdown)'),
      reviewers: z
        .array(z.string())
        .optional()
        .describe('Array of reviewer UUIDs or account IDs'),
      close_source_branch: z.boolean().default(true).describe('Delete source branch after merge'),
      draft: z.boolean().default(false).describe('Create PR as draft'),
    },
    async ({ workspace, repo_slug, title, source_branch, destination_branch, description, reviewers, close_source_branch, draft }) => {
      const body: Record<string, unknown> = {
        title,
        source: { branch: { name: source_branch } },
        close_source_branch,
      };

      if (destination_branch) {
        body.destination = { branch: { name: destination_branch } };
      }
      if (description) {
        body.description = description;
      }
      if (reviewers?.length) {
        body.reviewers = reviewers.map((r) => ({ uuid: r }));
      }
      if (draft) {
        body.draft = true;
      }

      const pr = await client.post<BitbucketPullRequest>(
        prBasePath(workspace, repo_slug),
        body
      );
      return textResult(`Pull request created successfully!\n\n${formatPrSummary(pr)}`);
    }
  );

  server.tool(
    'update_pull_request',
    'Update an existing pull request (title, description, reviewers)',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      pr_id: z.number().describe('Pull request ID'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      reviewers: z
        .array(z.string())
        .optional()
        .describe('New list of reviewer UUIDs'),
    },
    async ({ workspace, repo_slug, pr_id, title, description, reviewers }) => {
      const body: Record<string, unknown> = {};
      if (title) body.title = title;
      if (description !== undefined) body.description = description;
      if (reviewers) body.reviewers = reviewers.map((r) => ({ uuid: r }));

      const pr = await client.put<BitbucketPullRequest>(
        `${prBasePath(workspace, repo_slug)}/${pr_id}`,
        body
      );
      return textResult(`Pull request updated!\n\n${formatPrSummary(pr)}`);
    }
  );

  server.tool(
    'approve_pull_request',
    'Approve a pull request',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      pr_id: z.number().describe('Pull request ID'),
    },
    async ({ workspace, repo_slug, pr_id }) => {
      await client.post(
        `${prBasePath(workspace, repo_slug)}/${pr_id}/approve`
      );
      return textResult(`Pull request #${pr_id} approved`);
    }
  );

  server.tool(
    'unapprove_pull_request',
    'Remove approval from a pull request',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      pr_id: z.number().describe('Pull request ID'),
    },
    async ({ workspace, repo_slug, pr_id }) => {
      await client.delete(
        `${prBasePath(workspace, repo_slug)}/${pr_id}/approve`
      );
      return textResult(`Approval removed from pull request #${pr_id}`);
    }
  );

  server.tool(
    'request_changes',
    'Request changes on a pull request',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      pr_id: z.number().describe('Pull request ID'),
    },
    async ({ workspace, repo_slug, pr_id }) => {
      await client.post(
        `${prBasePath(workspace, repo_slug)}/${pr_id}/request-changes`
      );
      return textResult(`Changes requested on pull request #${pr_id}`);
    }
  );

  server.tool(
    'add_pull_request_comment',
    'Add a comment to a pull request (general, inline on a file/line, or reply to existing comment)',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      pr_id: z.number().describe('Pull request ID'),
      content: z.string().describe('Comment text (markdown supported)'),
      filepath: z.string().optional().describe('File path for inline comment'),
      line_to: z.number().optional().describe('Line number for inline comment (new file side)'),
      line_from: z.number().optional().describe('Line number for inline comment (old file side)'),
      parent_comment_id: z.number().optional().describe('Parent comment ID for reply threads'),
    },
    async ({ workspace, repo_slug, pr_id, content, filepath, line_to, line_from, parent_comment_id }) => {
      const body: Record<string, unknown> = {
        content: { raw: content },
      };

      if (filepath) {
        body.inline = {
          path: filepath,
          from: line_from ?? null,
          to: line_to ?? null,
        };
      }

      if (parent_comment_id) {
        body.parent = { id: parent_comment_id };
      }

      const comment = await client.post<BitbucketComment>(
        `${prBasePath(workspace, repo_slug)}/${pr_id}/comments`,
        body
      );
      const location = filepath ? ` on ${filepath}${line_to ? `:${line_to}` : ''}` : '';
      const reply = parent_comment_id ? ` (reply to #${parent_comment_id})` : '';
      return textResult(`Comment #${comment.id} added${location}${reply}`);
    }
  );

  // ─── DANGEROUS TOOLS ──────────────────────────────────────

  server.tool(
    'merge_pull_request',
    'Merge a pull request (requires BITBUCKET_ENABLE_DANGEROUS=true)',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      pr_id: z.number().describe('Pull request ID'),
      merge_strategy: z
        .enum(['merge_commit', 'squash', 'fast_forward'])
        .default('merge_commit')
        .describe('Merge strategy'),
      close_source_branch: z.boolean().default(true).describe('Delete source branch after merge'),
    },
    async ({ workspace, repo_slug, pr_id, merge_strategy, close_source_branch }) => {
      if (!config.enableDangerous) {
        return textResult(
          'Merge is a destructive operation. Set BITBUCKET_ENABLE_DANGEROUS=true to enable it.'
        );
      }

      const pr = await client.post<BitbucketPullRequest>(
        `${prBasePath(workspace, repo_slug)}/${pr_id}/merge`,
        {
          type: 'pullrequest',
          merge_strategy,
          close_source_branch,
        }
      );
      return textResult(`Pull request #${pr_id} merged successfully (${merge_strategy})!\n\n${formatPrSummary(pr)}`);
    }
  );

  server.tool(
    'decline_pull_request',
    'Decline a pull request (requires BITBUCKET_ENABLE_DANGEROUS=true)',
    {
      workspace: workspaceParam,
      repo_slug: z.string().describe('Repository slug'),
      pr_id: z.number().describe('Pull request ID'),
    },
    async ({ workspace, repo_slug, pr_id }) => {
      if (!config.enableDangerous) {
        return textResult(
          'Decline is a destructive operation. Set BITBUCKET_ENABLE_DANGEROUS=true to enable it.'
        );
      }

      const pr = await client.post<BitbucketPullRequest>(
        `${prBasePath(workspace, repo_slug)}/${pr_id}/decline`
      );
      return textResult(`Pull request #${pr_id} declined.\n\n${formatPrSummary(pr)}`);
    }
  );
}
