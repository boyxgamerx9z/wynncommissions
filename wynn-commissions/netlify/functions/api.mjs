import { getStore } from '@netlify/blobs';
import { createHandler } from '../lib/handler.mjs';

const handle = createHandler(getStore);

export default async (req) => handle(req);

export const config = { path: ['/api/*', '/uploads/*'] };
