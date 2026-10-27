import client from './axiosClient';
import { createElderlySafetyApi } from '../utils/elderlySafety';
import { webSession } from '../utils/webSession';
export const elderlySafetyApi = owner => createElderlySafetyApi(client, owner, () => webSession.capture());
