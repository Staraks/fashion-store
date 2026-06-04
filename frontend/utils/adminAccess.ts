import { AuthUser } from '../types';

export type AdminSectionId = 'catalog' | 'reviews' | 'orders' | 'reports' | 'users';

export function isAdminRole(user: AuthUser | null | undefined) {
  return Boolean(user && (user.isSuperuser || user.role === 'admin'));
}

export function canAccessAdminSection(user: AuthUser | null | undefined, section: AdminSectionId) {
  if (!user) return false;
  if (isAdminRole(user)) return true;

  if (section === 'catalog') return user.role === 'content_manager';
  if (section === 'reviews') return user.role === 'content_manager';
  if (section === 'orders') return user.role === 'sales_manager';
  if (section === 'reports') return user.role === 'sales_manager';
  if (section === 'users') return false;

  return false;
}

export function canAccessAdmin(user: AuthUser | null | undefined) {
  return (
    canAccessAdminSection(user, 'catalog') ||
    canAccessAdminSection(user, 'reviews') ||
    canAccessAdminSection(user, 'orders') ||
    canAccessAdminSection(user, 'reports') ||
    canAccessAdminSection(user, 'users')
  );
}
