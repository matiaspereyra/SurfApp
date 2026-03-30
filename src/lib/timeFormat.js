export const formatRelativeMinutes = (minutesAgo, options = {}) => {
  const { withAgoPrefix = false } = options;
  const safeMinutes = Math.max(0, Number(minutesAgo) || 0);

  if (safeMinutes < 1) {
    return withAgoPrefix ? 'justo ahora' : 'ahora';
  }

  if (safeMinutes < 60) {
    const label = `${Math.floor(safeMinutes)}m`;
    return withAgoPrefix ? `hace ${label}` : label;
  }

  const hours = Math.floor(safeMinutes / 60);
  const label = `${hours}h`;
  return withAgoPrefix ? `hace ${label}` : label;
};
