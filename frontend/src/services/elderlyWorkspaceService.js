import axiosClient from './axiosClient';
import { createElderlyWorkspaceApi } from '../utils/elderlyWorkspace';

export default createElderlyWorkspaceApi(axiosClient);
