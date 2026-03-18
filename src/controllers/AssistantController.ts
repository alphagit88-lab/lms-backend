import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { TeacherAssistant } from "../entities/TeacherAssistant";

export class AssistantController {
  // Add an assistant
  static addAssistant = async (req: Request, res: Response): Promise<Response> => {
    try {
      const teacherId = req.session.userId!;
      const { assistantEmail, canManageSlots, canManageBookings } = req.body;

      if (!assistantEmail) {
        return res.status(400).json({ error: "Assistant email is required" });
      }

      const userRepo = AppDataSource.getRepository(User);
      const assistantUser = await userRepo.findOne({ where: { email: assistantEmail } });

      if (!assistantUser) {
        return res.status(404).json({ error: "User with this email not found" });
      }

      if (assistantUser.id === teacherId) {
        return res.status(400).json({ error: "You cannot add yourself as an assistant" });
      }

      const assistantRepo = AppDataSource.getRepository(TeacherAssistant);
      const existing = await assistantRepo.findOne({
        where: { teacherId, assistantId: assistantUser.id },
      });

      if (existing) {
        return res.status(409).json({ error: "User is already your assistant" });
      }

      const assistant = assistantRepo.create({
        teacherId,
        assistantId: assistantUser.id,
        canManageSlots: canManageSlots !== undefined ? canManageSlots : true,
        canManageBookings: canManageBookings !== undefined ? canManageBookings : true,
      });

      await assistantRepo.save(assistant);

      return res.status(201).json({
        message: "Assistant added successfully",
        assistant: {
          id: assistant.id,
          assistantId: assistantUser.id,
          name: `${assistantUser.firstName} ${assistantUser.lastName}`,
          email: assistantUser.email,
          permissions: {
            manageSlots: assistant.canManageSlots,
            manageBookings: assistant.canManageBookings,
          },
        },
      });
    } catch (error: any) {
      console.error("Error adding assistant:", error);
      return res.status(500).json({ error: "Failed to add assistant" });
    }
  };

  // Get my assistants
  static getMyAssistants = async (req: Request, res: Response): Promise<Response> => {
    try {
      const teacherId = req.session.userId!;

      const assistantRepo = AppDataSource.getRepository(TeacherAssistant);
      const assistants = await assistantRepo.find({
        where: { teacherId },
        relations: ["assistant"],
      });

      return res.json({
        assistants: assistants.map((a) => ({
          id: a.id,
          assistantId: a.assistantId,
          name: `${a.assistant.firstName} ${a.assistant.lastName}`,
          email: a.assistant.email,
          permissions: {
            manageSlots: a.canManageSlots,
            manageBookings: a.canManageBookings,
          },
          createdAt: a.createdAt,
        })),
      });
    } catch (error: any) {
      console.error("Error fetching assistants:", error);
      return res.status(500).json({ error: "Failed to fetch assistants" });
    }
  };

  // Update assistant permissions
  static updatePermissions = async (req: Request, res: Response): Promise<Response> => {
    try {
      const teacherId = req.session.userId!;
      const id = req.params.id as string; // Relationship ID
      const { canManageSlots, canManageBookings } = req.body;

      const assistantRepo = AppDataSource.getRepository(TeacherAssistant);
      const assistant = await assistantRepo.findOne({
        where: { id, teacherId },
      });

      if (!assistant) {
        return res.status(404).json({ error: "Assistant not found" });
      }

      if (canManageSlots !== undefined) assistant.canManageSlots = canManageSlots;
      if (canManageBookings !== undefined) assistant.canManageBookings = canManageBookings;

      await assistantRepo.save(assistant);

      return res.json({ message: "Permissions updated successfully", assistant });
    } catch (error: any) {
      console.error("Error updating assistant permissions:", error);
      return res.status(500).json({ error: "Failed to update permissions" });
    }
  };

  // Remove assistant
  static removeAssistant = async (req: Request, res: Response): Promise<Response> => {
    try {
      const teacherId = req.session.userId!;
      const id = req.params.id as string;

      const assistantRepo = AppDataSource.getRepository(TeacherAssistant);
      const assistant = await assistantRepo.findOne({
        where: { id, teacherId },
      });

      if (!assistant) {
        return res.status(404).json({ error: "Assistant not found" });
      }

      await assistantRepo.remove(assistant);

      return res.json({ message: "Assistant removed successfully" });
    } catch (error: any) {
      console.error("Error removing assistant:", error);
      return res.status(500).json({ error: "Failed to remove assistant" });
    }
  };

  // Get teachers I am an assistant for
  static getMyTeachers = async (req: Request, res: Response): Promise<Response> => {
    try {
      const assistantId = req.session.userId!;

      const assistantRepo = AppDataSource.getRepository(TeacherAssistant);
      const links = await assistantRepo.find({
        where: { assistantId },
        relations: ["teacher"],
      });

      return res.json({
        teachers: links.map((l) => ({
          teacherId: l.teacherId,
          name: `${l.teacher.firstName} ${l.teacher.lastName}`,
          email: l.teacher.email,
          permissions: {
            manageSlots: l.canManageSlots,
            manageBookings: l.canManageBookings,
          },
        })),
      });
    } catch (error: any) {
      console.error("Error fetching teachers:", error);
      return res.status(500).json({ error: "Failed to fetch teachers" });
    }
  };
}
