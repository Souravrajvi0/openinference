import { AsyncLocalStorage } from 'node:async_hooks';

export const tenantStore = new AsyncLocalStorage<string>();
