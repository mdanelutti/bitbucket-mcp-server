export interface BitbucketUser {
  display_name: string;
  uuid: string;
  account_id?: string;
  nickname?: string;
  links?: {
    html?: { href: string };
    avatar?: { href: string };
  };
}

export interface BitbucketRepo {
  slug: string;
  name: string;
  full_name: string;
  uuid: string;
}

export interface BitbucketBranch {
  name: string;
  merge_strategies?: string[];
  default_merge_strategy?: string;
}

export interface BitbucketPullRequest {
  id: number;
  title: string;
  description: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
  created_on: string;
  updated_on: string;
  author: BitbucketUser;
  source: {
    branch: BitbucketBranch;
    repository: BitbucketRepo;
  };
  destination: {
    branch: BitbucketBranch;
    repository: BitbucketRepo;
  };
  reviewers: BitbucketUser[];
  participants: BitbucketParticipant[];
  close_source_branch: boolean;
  merge_commit?: { hash: string } | null;
  comment_count: number;
  task_count: number;
  links: {
    html: { href: string };
    diff: { href: string };
    self: { href: string };
  };
}

export interface BitbucketParticipant {
  user: BitbucketUser;
  role: 'PARTICIPANT' | 'REVIEWER' | 'AUTHOR';
  approved: boolean;
  state: 'approved' | 'changes_requested' | null;
}

export interface BitbucketComment {
  id: number;
  content: {
    raw: string;
    markup: string;
    html: string;
  };
  created_on: string;
  updated_on: string;
  user: BitbucketUser;
  inline?: {
    path: string;
    from: number | null;
    to: number | null;
  };
  parent?: {
    id: number;
  };
  deleted: boolean;
}

export interface BitbucketActivity {
  pull_request: BitbucketPullRequest;
  update?: {
    state: string;
    title: string;
    date: string;
    author: BitbucketUser;
  };
  approval?: {
    date: string;
    user: BitbucketUser;
  };
  comment?: BitbucketComment;
}

export interface PaginatedResponse<T> {
  values: T[];
  pagelen: number;
  size?: number;
  page?: number;
  next?: string;
  previous?: string;
}

export interface BitbucketError {
  type: string;
  error: {
    message: string;
    detail?: string;
  };
}
