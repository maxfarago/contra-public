// Date and time formatting utilities

export const formatAge = (dateString: string): string => {
  const now = new Date();
  const orderDate = new Date(dateString);
  const diffInMs = now.getTime() - orderDate.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInDays > 0) {
    return `${diffInDays}d ago`;
  } else if (diffInHours > 0) {
    return `${diffInHours}h ago`;
  } else if (diffInMinutes > 0) {
    return `${diffInMinutes}m ago`;
  } else {
    return 'Just now';
  }
};

