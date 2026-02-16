import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";

export class UserController {
  static async getAllUsers(req: Request, res: Response) {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const users = await userRepository.find();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  }

  static async getUserById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOneBy({ id });
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  }

  static async createUser(req: Request, res: Response) {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const user = userRepository.create(req.body);
      const result = await userRepository.save(user);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  }

  static async updateUser(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOneBy({ id });
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      userRepository.merge(user, req.body);
      const result = await userRepository.save(user);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  }

  static async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userRepository = AppDataSource.getRepository(User);
      const result = await userRepository.delete(id);
      
      if (result.affected === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  }
}
