import { DB_PATH } from '$app/env/private';

import { workspacePath } from '#lib/server/workspace-paths.js';

import { databasePathVariable } from '../../../env.js';
import { createDatabasePathPolicy } from './path-policy.js';

const policy = createDatabasePathPolicy(DB_PATH, workspacePath(), databasePathVariable);

export const { databasePath } = policy;
export const { assertSafeDatabasePath } = policy;
