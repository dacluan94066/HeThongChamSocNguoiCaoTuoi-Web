export const formatEntityCode = (prefix, id, length = 5) => {
  if (id === null || id === undefined || id === '') return '—';
  return `${prefix}-${String(id).padStart(length, '0')}`;
};
export const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayPassed = today.getMonth() > birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!birthdayPassed) age -= 1;
  return age >= 0 ? age : null;
};

export const getNameInitials = (name = '') => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

const AVATAR_COLORS = ['#2E7D9A', '#4CAF93', '#7C6FB0', '#D4870A', '#C75B7A', '#5078A0', '#8A6D3B'];

export const getNameColor = (name = '') => {
  const hash = [...name].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};
