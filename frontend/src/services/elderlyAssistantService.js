import client from './axiosClient';
import { webSession } from '../utils/webSession';
import { createElderlyAssistantApi } from '../utils/elderlyAssistant';

export const elderlyAssistantApi = profileId => createElderlyAssistantApi(client, profileId, () => webSession.capture());
