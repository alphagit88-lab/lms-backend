import "../types/express-session";
import { Request, Response } from "express";
import { AuthService } from "../services/AuthService";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import path from "path";
import fs from "fs";

const authService = new AuthService();

export class AuthController {
  /**
   * Register new user
   * POST /api/auth/register
   */
  static async register(req: Request, res: Response) {
    try {
      const { email, password, firstName, lastName, role } = req.body;

      // Validation
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({
          error: "Email, password, first name, and last name are required",
        });
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      // Password strength validation
      if (password.length < 8) {
        return res
          .status(400)
          .json({ error: "Password must be at least 8 characters long" });
      }

      // Password complexity validation
      const hasUpperCase = /[A-Z]/.test(password);
      const hasLowerCase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

      if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
        return res.status(400).json({
          error: "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
        });
      }

      // Role validation (prevent "admin" registration)
      if (role && !["student", "instructor", "parent"].includes(role)) {
        return res.status(400).json({
          error: "Invalid role. Must be student, instructor, or parent. Admin registration is not permitted.",
        });
      }

      const user = await authService.register({
        email,
        password,
        firstName,
        lastName,
        role,
      });

      // Create session
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      req.session.userRole = user.role;

      // EXPLICIT SAVE: Crucial for serverless environments (Vercel) to ensure session is written before response
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      res.status(201).json({
        message: "Registration successful",
        user,
      });
    } catch (error: any) {
      if (error.message === "User with this email already exists") {
        return res.status(409).json({ error: error.message });
      }
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   */
  static async login(req: Request, res: Response) {
    try {
      console.log("Login attempt:", req.body.email);
      const { email, password } = req.body;

      // Validation
      if (!email || !password) {
        return res
          .status(400)
          .json({ error: "Email and password are required" });
      }

      // Check DB connection first to avoid 500 later
      if (!AppDataSource.isInitialized) {
        console.error("Database not initialized. Cannot process login.");
        return res.status(503).json({ error: "Service unavailable. Database connecting..." });
      }

      console.log("Calling authService.login...");
      const user = await authService.login(email, password);
      console.log("User logged in successfully:", user.id);

      // Create session
      if (!req.session) {
        console.error("Session object is missing on request!");
        return res.status(500).json({ error: "Session initialization failed" });
      }

      req.session.userId = user.id;
      req.session.userEmail = user.email;
      req.session.userRole = user.role;

      console.log("Session data set. Saving session...");

      // EXPLICIT SAVE: Crucial for serverless environments (Vercel) to ensure session is written before response
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            reject(err);
          } else {
            console.log("Session saved successfully.");
            resolve();
          }
        });
      });

      res.json({
        message: "Login successful",
        user,
      });
    } catch (error: any) {
      if (
        error.message === "Invalid email or password" ||
        error.message === "Account is deactivated"
      ) {
        console.warn(`Login failed for ${req.body.email}: ${error.message}`);
        return res.status(401).json({ error: error.message });
      }
      console.error("Login error details:", error);
      console.error("Stack trace:", error.stack);
      // Return detailed error message for debugging purposes
      res.status(500).json({ error: "Login failed", details: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
    }
  }

  /**
   * Logout user
   * POST /api/auth/logout
   */
  static async logout(req: Request, res: Response) {
    try {
      req.session.destroy((err) => {
        if (err) {
          console.error("Logout error:", err);
          return res.status(500).json({ error: "Logout failed" });
        }

        res.clearCookie("connect.sid");
        res.json({ message: "Logout successful" });
      });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  }

  /**
   * Get current user
   * GET /api/auth/me
   */
  static async getCurrentUser(req: Request, res: Response) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await authService.getUserById(req.session.userId);

      res.json({ user });
    } catch (error) {
      console.error("Get current user error:", error);
      res.status(500).json({ error: "Failed to get user information" });
    }
  }

  /**
   * Update user profile
   * PUT /api/auth/profile
   */
  static async updateProfile(req: Request, res: Response) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { firstName, lastName, bio, profilePicture } = req.body;

      const user = await authService.updateProfile(req.session.userId, {
        firstName,
        lastName,
        bio,
        profilePicture,
      });

      res.json({
        message: "Profile updated successfully",
        user,
      });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  }

  /**
   * Change password
   * PUT /api/auth/change-password
   */
  static async changePassword(req: Request, res: Response) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { currentPassword, newPassword } = req.body;

      // Validation
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          error: "Current password and new password are required",
        });
      }

      if (newPassword.length < 8) {
        return res
          .status(400)
          .json({ error: "New password must be at least 8 characters long" });
      }

      // Password complexity validation
      const hasUpperCase = /[A-Z]/.test(newPassword);
      const hasLowerCase = /[a-z]/.test(newPassword);
      const hasNumber = /[0-9]/.test(newPassword);
      const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

      if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
        return res.status(400).json({
          error: "New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
        });
      }

      const result = await authService.changePassword(
        req.session.userId,
        currentPassword,
        newPassword
      );

      res.json(result);
    } catch (error: any) {
      if (error.message === "Current password is incorrect") {
        return res.status(400).json({ error: error.message });
      }
      console.error("Change password error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  }

  /**
   * Forgot password - request a reset token
   * POST /api/auth/forgot-password
   */
  static async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      const result = await authService.forgotPassword(email);

      // Always return 200 to avoid revealing whether an email exists
      res.json(result);
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ error: "Failed to process password reset request" });
    }
  }

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   */
  static async resetPassword(req: Request, res: Response) {
    try {
      const { email, token, newPassword } = req.body;

      // Validation
      if (!email || !token || !newPassword) {
        return res.status(400).json({
          error: "Email, token, and new password are required",
        });
      }

      if (newPassword.length < 8) {
        return res
          .status(400)
          .json({ error: "New password must be at least 8 characters long" });
      }

      // Password complexity validation
      const hasUpperCase = /[A-Z]/.test(newPassword);
      const hasLowerCase = /[a-z]/.test(newPassword);
      const hasNumber = /[0-9]/.test(newPassword);
      const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

      if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
        return res.status(400).json({
          error: "New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
        });
      }

      const result = await authService.resetPassword(email, token, newPassword);

      res.json(result);
    } catch (error: any) {
      if (error.message === "Invalid or expired reset token") {
        return res.status(400).json({ error: error.message });
      }
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  }

  /**
   * Check authentication status
   * GET /api/auth/status
   */
  static async checkStatus(req: Request, res: Response) {
    res.json({
      isAuthenticated: !!req.session.userId,
      userId: req.session.userId || null,
      userEmail: req.session.userEmail || null,
      userRole: req.session.userRole || null,
    });
  }

  /**
   * Upload profile picture
   * POST /api/auth/profile-picture
   */
  static async uploadProfilePicture(req: Request, res: Response) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: req.session.userId } });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Delete old profile picture file if it exists
      if (user.profilePicture) {
        const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
        if (blobToken && user.profilePicture.includes('public.blob.vercel-storage.com')) {
          const { del } = require('@vercel/blob');
          await del(user.profilePicture, { token: blobToken });
        } else {
          const isVercelContext = !!process.env.VERCEL;
          const uploadBase = isVercelContext ? "/tmp" : process.cwd();
          const oldPath = path.join(uploadBase, user.profilePicture.replace(/^\//, ""));
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
      }

      const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
      let relativePath = `/uploads/profile-pictures/${req.file.filename}`;
      
      if (blobToken) {
        // Upload to Vercel blob using the local file that was saved by diskStorage
        const { put } = require('@vercel/blob');
        const fileBuffer = fs.readFileSync(req.file.path);
        const { url } = await put(`uploads/profile-pictures/${req.file.filename}`, fileBuffer, {
          access: 'public',
          token: blobToken,
        });
        
        relativePath = url;

        // Clean up the temporary file from the local/tmp disk since it's uploaded
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }

      user.profilePicture = relativePath;
      await userRepo.save(user);

      // Return the updated user (without password)
      const { password: _, ...safeUser } = user as any;

      res.json({
        message: "Profile picture updated successfully",
        user: safeUser,
      });
    } catch (error) {
      console.error("Upload profile picture error:", error);
      res.status(500).json({ error: "Failed to upload profile picture" });
    }
  }

  /**
   * Delete profile picture
   * DELETE /api/auth/profile-picture
   */
  static async deleteProfilePicture(req: Request, res: Response) {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: req.session.userId } });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Delete the file from disk or Blob
      if (user.profilePicture) {
        const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
        if (blobToken && user.profilePicture.includes('public.blob.vercel-storage.com')) {
          const { del } = require('@vercel/blob');
          await del(user.profilePicture, { token: blobToken });
        } else {
          const isVercelContext = !!process.env.VERCEL;
          const uploadBase = isVercelContext ? "/tmp" : process.cwd();
          const filePath = path.join(uploadBase, user.profilePicture.replace(/^\//, ""));
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      }

      user.profilePicture = undefined;
      await userRepo.save(user);

      const { password: _, ...safeUser } = user as any;

      res.json({
        message: "Profile picture removed",
        user: safeUser,
      });
    } catch (error) {
      console.error("Delete profile picture error:", error);
      res.status(500).json({ error: "Failed to delete profile picture" });
    }
  }
}
