import client from './axiosClient';
import { createElderlyCareApi } from '../utils/elderlyCare';
import { webSession } from '../utils/webSession';
export default createElderlyCareApi(client, () => webSession.capture());
