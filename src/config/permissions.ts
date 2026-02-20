/**
 * Role-Based Access Control Configuration
 * Defines permissions for each role in the system
 */

export enum Role {
  STUDENT = "student",
  INSTRUCTOR = "instructor",
  PARENT = "parent",
  ADMIN = "admin"
}

export enum Permission {
  // User permissions
  VIEW_OWN_PROFILE = "view:own:profile",
  EDIT_OWN_PROFILE = "edit:own:profile",
  VIEW_ANY_PROFILE = "view:any:profile",
  EDIT_ANY_PROFILE = "edit:any:profile",
  
  // Course permissions
  VIEW_COURSES = "view:courses",
  ENROLL_COURSES = "enroll:courses",
  CREATE_COURSES = "create:courses",
  EDIT_OWN_COURSES = "edit:own:courses",
  EDIT_ANY_COURSES = "edit:any:courses",
  DELETE_OWN_COURSES = "delete:own:courses",
  DELETE_ANY_COURSES = "delete:any:courses",
  APPROVE_COURSES = "approve:courses",
  
  // Lesson permissions
  VIEW_LESSONS = "view:lessons",
  CREATE_LESSONS = "create:lessons",
  EDIT_OWN_LESSONS = "edit:own:lessons",
  EDIT_ANY_LESSONS = "edit:any:lessons",
  DELETE_OWN_LESSONS = "delete:own:lessons",
  DELETE_ANY_LESSONS = "delete:any:lessons",
  
  // Booking permissions
  CREATE_BOOKINGS = "create:bookings",
  VIEW_OWN_BOOKINGS = "view:own:bookings",
  VIEW_ALL_BOOKINGS = "view:all:bookings",
  CANCEL_OWN_BOOKINGS = "cancel:own:bookings",
  APPROVE_BOOKINGS = "approve:bookings",
  
  // Payment permissions
  MAKE_PAYMENTS = "make:payments",
  VIEW_OWN_PAYMENTS = "view:own:payments",
  VIEW_ALL_PAYMENTS = "view:all:payments",
  PROCESS_PAYOUTS = "process:payouts",
  
  // Parent permissions
  LINK_STUDENTS = "link:students",
  VIEW_CHILD_PROGRESS = "view:child:progress",
  VIEW_CHILD_REPORTS = "view:child:reports",
  
  // Analytics permissions
  VIEW_OWN_ANALYTICS = "view:own:analytics",
  VIEW_ALL_ANALYTICS = "view:all:analytics",
  
  // Admin permissions
  MANAGE_USERS = "manage:users",
  MANAGE_CATEGORIES = "manage:categories",
  VIEW_PLATFORM_ANALYTICS = "view:platform:analytics",
  CONFIGURE_SYSTEM = "configure:system"
}

/**
 * Role-Permission mapping
 * Defines which permissions each role has
 */
export const RolePermissions: Record<Role, Permission[]> = {
  [Role.STUDENT]: [
    Permission.VIEW_OWN_PROFILE,
    Permission.EDIT_OWN_PROFILE,
    Permission.VIEW_COURSES,
    Permission.ENROLL_COURSES,
    Permission.VIEW_LESSONS,
    Permission.CREATE_BOOKINGS,
    Permission.VIEW_OWN_BOOKINGS,
    Permission.CANCEL_OWN_BOOKINGS,
    Permission.MAKE_PAYMENTS,
    Permission.VIEW_OWN_PAYMENTS,
    Permission.VIEW_OWN_ANALYTICS,
  ],
  
  [Role.INSTRUCTOR]: [
    Permission.VIEW_OWN_PROFILE,
    Permission.EDIT_OWN_PROFILE,
    Permission.VIEW_COURSES,
    Permission.ENROLL_COURSES,
    Permission.CREATE_COURSES,
    Permission.EDIT_OWN_COURSES,
    Permission.DELETE_OWN_COURSES,
    Permission.VIEW_LESSONS,
    Permission.CREATE_LESSONS,
    Permission.EDIT_OWN_LESSONS,
    Permission.DELETE_OWN_LESSONS,
    Permission.VIEW_OWN_BOOKINGS,
    Permission.APPROVE_BOOKINGS,
    Permission.VIEW_OWN_PAYMENTS,
    Permission.VIEW_OWN_ANALYTICS,
    Permission.CREATE_BOOKINGS,
    Permission.CANCEL_OWN_BOOKINGS,
    Permission.MAKE_PAYMENTS,
  ],
  
  [Role.PARENT]: [
    Permission.VIEW_OWN_PROFILE,
    Permission.EDIT_OWN_PROFILE,
    Permission.VIEW_COURSES,
    Permission.LINK_STUDENTS,
    Permission.VIEW_CHILD_PROGRESS,
    Permission.VIEW_CHILD_REPORTS,
    Permission.MAKE_PAYMENTS,
    Permission.VIEW_OWN_PAYMENTS,
  ],
  
  [Role.ADMIN]: [
    // Admins have all permissions
    ...Object.values(Permission),
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = RolePermissions[role];
  return permissions.includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(role, permission));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(role, permission));
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: Role): Permission[] {
  return RolePermissions[role] || [];
}
