import { read } from '$app/server';

import examPackSchemaUrl from '../../../../../packs/exam-pack.schema.json?url';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () => {
  const response = read(examPackSchemaUrl);
  response.headers.set('cache-control', 'public, max-age=3600');
  response.headers.set('content-type', 'application/schema+json; charset=utf-8');

  return response;
};
