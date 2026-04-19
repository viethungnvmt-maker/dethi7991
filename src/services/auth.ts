import Swal from 'sweetalert2';

export const checkAuthQuota = (): boolean => {
  const isLoggedIn = localStorage.getItem('is_logged_in') === 'true';
  if (isLoggedIn) return true;
  
  const count = parseInt(localStorage.getItem('free_usage_count') || '0', 10);
  return count < 1;
};

export const incrementQuota = () => {
  const isLoggedIn = localStorage.getItem('is_logged_in') === 'true';
  if (isLoggedIn) return;
  
  const count = parseInt(localStorage.getItem('free_usage_count') || '0', 10);
  localStorage.setItem('free_usage_count', (count + 1).toString());
};
