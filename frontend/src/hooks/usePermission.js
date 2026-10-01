import { useAuth } from '../context/AuthContext';

const usePermission = () => {
  const { permissions, permissionsLoading, hasPermission } = useAuth();
  return { permissions, permissionsLoading, hasPermission };
};

export default usePermission;
