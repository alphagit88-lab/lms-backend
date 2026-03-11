import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Notification } from "../entities/Notification";
import { parsePagination, createPaginationMeta } from "../utils/pagination";

export class NotificationController {
  /**
   * GET /api/notifications
   * Returns paginated notifications for the current user (newest first)
   */
  static getNotifications = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;
      const { unreadOnly } = req.query;
      const pagination = parsePagination(req.query, 20, 100);

      const repo = AppDataSource.getRepository(Notification);
      const qb = repo
        .createQueryBuilder("n")
        .where("n.userId = :userId", { userId })
        .orderBy("n.sentAt", "DESC")
        .skip((pagination.page - 1) * pagination.limit)
        .take(pagination.limit);

      if (unreadOnly === "true") {
        qb.andWhere("n.isRead = false");
      }

      const [notifications, total] = await qb.getManyAndCount();

      return res.json({
        notifications,
        pagination: createPaginationMeta(total, pagination.page, pagination.limit),
      });
    } catch (err) {
      console.error("[NotificationController] getNotifications:", err);
      return res.status(500).json({ error: "Failed to fetch notifications." });
    }
  };

  /**
   * GET /api/notifications/unread-count
   * Returns { count: N }
   */
  static getUnreadCount = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;
      const count = await AppDataSource.getRepository(Notification).count({
        where: { userId, isRead: false },
      });
      return res.json({ count });
    } catch (err) {
      console.error("[NotificationController] getUnreadCount:", err);
      return res.status(500).json({ error: "Failed to get unread count." });
    }
  };

  /**
   * PATCH /api/notifications/:id/read
   * Mark a single notification as read (owner only)
   */
  static markRead = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;
      const id = req.params.id as string;

      const repo = AppDataSource.getRepository(Notification);
      const notification = await repo.findOne({ where: { id } });

      if (!notification) return res.status(404).json({ error: "Notification not found." });
      if (notification.userId !== userId) return res.status(403).json({ error: "Access denied." });

      if (!notification.isRead) {
        notification.isRead = true;
        notification.readAt = new Date();
        await repo.save(notification);
      }

      return res.json({ message: "Marked as read.", notification });
    } catch (err) {
      console.error("[NotificationController] markRead:", err);
      return res.status(500).json({ error: "Failed to mark notification as read." });
    }
  };

  /**
   * PATCH /api/notifications/read-all
   * Mark all notifications for current user as read
   */
  static markAllRead = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;
      const now = new Date();

      await AppDataSource.getRepository(Notification)
        .createQueryBuilder()
        .update(Notification)
        .set({ isRead: true, readAt: now })
        .where("userId = :userId AND isRead = false", { userId })
        .execute();

      return res.json({ message: "All notifications marked as read." });
    } catch (err) {
      console.error("[NotificationController] markAllRead:", err);
      return res.status(500).json({ error: "Failed to mark all as read." });
    }
  };

  /**
   * DELETE /api/notifications/:id
   * Delete a notification (owner only)
   */
  static deleteNotification = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;
      const id = req.params.id as string;

      const repo = AppDataSource.getRepository(Notification);
      const notification = await repo.findOne({ where: { id } });

      if (!notification) return res.status(404).json({ error: "Notification not found." });
      if (notification.userId !== userId) return res.status(403).json({ error: "Access denied." });

      await repo.remove(notification);
      return res.json({ message: "Notification deleted." });
    } catch (err) {
      console.error("[NotificationController] deleteNotification:", err);
      return res.status(500).json({ error: "Failed to delete notification." });
    }
  };
}
