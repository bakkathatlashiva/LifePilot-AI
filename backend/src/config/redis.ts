import { valkeyClient, valkeyCache } from './valkey';

export const redis = valkeyClient;
export const redisCache = valkeyCache;
export default valkeyClient;
