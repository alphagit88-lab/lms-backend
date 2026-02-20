import "../types/express-session";
import { Request, Response, NextFunction } from "express";
import { Permission, Role, hasPermission, getRolePermissions } from "../config/permissions";
import { AppDataSource } from "../config/data-source";

/**
 * Middleware to check if user is authenticated
 * Verifies that a valid session exists with userId
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Authentication required",
      message: "Please log in to access this resource",
    });
  }

  next();
};

/**
 * Middleware to check if user has required role(s)
 * Must be used after authenticate middleware
 * @param roles - Array of allowed roles or single role string
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Please log in to access this resource",
      });
    }

    if (!req.session.userRole) {
      return res.status(403).json({
        error: "Access denied",
        message: "User role not found",
      });
    }

    if (!roles.includes(req.session.userRole)) {
      return res.status(403).json({
        error: "Access denied",
        message: `This resource requires one of the following roles: ${roles.join(
          ", "
        )}`,
      });
    }

    next();
  };
};

/**
 * Permission-based authorization middleware
 * Checks if user has specific permission based on their role
 * @param permission - Required permission from Permission enum
 */
export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId || !req.session.userRole) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Please log in to access this resource",
      });
    }

    const userRole = req.session.userRole as Role;
    
    if (!hasPermission(userRole, permission)) {
      return res.status(403).json({
        error: "Access denied",
        message: `You don't have permission: ${permission}`,
        requiredPermission: permission,
        yourPermissions: getRolePermissions(userRole),
      });
    }

    next();
  };
};

/**
 * Resource ownership validation middleware
 * Verifies that the authenticated user owns the requested resource
 * Admin users bypass this check
 * @param resourceType - Entity name (e.g., 'Course', 'Lesson')
 * @param resourceIdParam - Request parameter containing resource ID (default: 'id')
 * @param ownerField - Field name in entity that contains owner ID (default: 'instructorId')
 */
export const requireOwnership = (
  resourceType: string,
  resourceIdParam: string = "id",
  ownerField: string = "instructorId"
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      // Admin bypasses ownership check
      if (userRole === "admin") {
        return next();
      }

      const resourceId = req.params[resourceIdParam];
      
      if (!resourceId) {
        return res.status(400).json({
          error: "Resource ID not provided",
        });
      }

      // Get repository for the resource type
      const repository = AppDataSource.getRepository(resourceType);
      const resource = await repository.findOne({
        where: { id: resourceId } as any,
      });

      if (!resource) {
        return res.status(404).json({
          error: `${resourceType} not found`,
        });
      }

      // Check ownership
      const ownerId = (resource as any)[ownerField];
      
      if (ownerId !== userId) {
        return res.status(403).json({
          error: "Access denied",
          message: `You don't have permission to access this ${resourceType.toLowerCase()}`,
        });
      }

      next();
    } catch (error) {
      console.error("Ownership validation error:", error);
      res.status(500).json({
        error: "Failed to validate resource ownership",
      });
    }
  };
};

/**
 * Middleware to check if user is admin
 * Shorthand for authorize('admin')
 */
export const isAdmin = authorize("admin");

/**
 * Middleware to check if user is instructor or admin
 * Common permission pattern for course management
 */
export const isInstructorOrAdmin = authorize("instructor", "admin");

/**
 * Middleware to check if user is student (any authenticated user can be a student)
 * This includes instructors and admins who can also enroll in courses
 */
export const isStudent = authenticate;

/**
 * Middleware to check if user is parent
 */
export const isParent = authorize("parent");

/**
 * Middleware to sanitize user data before sending response
 * Removes sensitive fields like password, even if accidentally included
 */
export const sanitizeUserData = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const originalJson = res.json.bind(res);
  
  res.json = function (data: any): Response {
    // Recursively remove password fields
    const sanitize = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      }
      
      if (obj && typeof obj === "object") {
        const sanitized = { ...obj };
        
        // Remove sensitive fields
        delete sanitized.password;
        
        // Recursively sanitize nested objects
        Object.keys(sanitized).forEach(key => {
          if (sanitized[key] && typeof sanitized[key] === "object") {
            sanitized[key] = sanitize(sanitized[key]);
          }
        });
        
        return sanitized;
      }
      
      return obj;
    };
    
    return originalJson(sanitize(data));
  };
  
  next();
};
