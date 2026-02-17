import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Category } from "../entities/Category";

const categoryRepository = AppDataSource.getRepository(Category);

export class CategoryController {
  /**
   * Get all categories
   * GET /api/categories
   */
  static async getAll(req: Request, res: Response) {
    try {
      const { includeInactive } = req.query;

      const queryBuilder = categoryRepository.createQueryBuilder("category");

      // Filter by active status unless includeInactive is true
      if (includeInactive !== "true") {
        queryBuilder.where("category.isActive = :isActive", { isActive: true });
      }

      const categories = await queryBuilder
        .orderBy("category.sortOrder", "ASC")
        .addOrderBy("category.name", "ASC")
        .getMany();

      res.json({ categories });
    } catch (error) {
      console.error("Get categories error:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  }

  /**
   * Get single category
   * GET /api/categories/:id
   */
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Ensure param is string
      if (Array.isArray(id)) {
        return res.status(400).json({ error: "Invalid category ID" });
      }

      const category = await categoryRepository.findOne({
        where: { id: id as string },
        relations: ["courses"],
      });

      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      res.json({ category });
    } catch (error) {
      console.error("Get category error:", error);
      res.status(500).json({ error: "Failed to fetch category" });
    }
  }

  /**
   * Create new category (Admin only)
   * POST /api/categories
   */
  static async create(req: Request, res: Response) {
    try {
      const { name, slug, description, icon, sortOrder } = req.body;

      // Validation
      if (!name || !slug) {
        return res.status(400).json({ error: "Name and slug are required" });
      }

      // Check if slug already exists
      const existingCategory = await categoryRepository.findOne({
        where: { slug },
      });

      if (existingCategory) {
        return res
          .status(409)
          .json({ error: "Category with this slug already exists" });
      }

      const category = categoryRepository.create({
        name,
        slug,
        description,
        icon,
        sortOrder: sortOrder || 0,
        isActive: true,
      });

      await categoryRepository.save(category);

      res.status(201).json({
        message: "Category created successfully",
        category,
      });
    } catch (error) {
      console.error("Create category error:", error);
      res.status(500).json({ error: "Failed to create category" });
    }
  }

  /**
   * Update category (Admin only)
   * PUT /api/categories/:id
   */
  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, slug, description, icon, sortOrder, isActive } = req.body;

      // Ensure param is string
      if (Array.isArray(id)) {
        return res.status(400).json({ error: "Invalid category ID" });
      }

      const category = await categoryRepository.findOne({ where: { id: id as string } });

      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      // Check if slug is being changed and if it already exists
      if (slug && slug !== category.slug) {
        const existingCategory = await categoryRepository.findOne({
          where: { slug },
        });

        if (existingCategory) {
          return res
            .status(409)
            .json({ error: "Category with this slug already exists" });
        }
      }

      // Update fields
      if (name !== undefined) category.name = name;
      if (slug !== undefined) category.slug = slug;
      if (description !== undefined) category.description = description;
      if (icon !== undefined) category.icon = icon;
      if (sortOrder !== undefined) category.sortOrder = sortOrder;
      if (isActive !== undefined) category.isActive = isActive;

      await categoryRepository.save(category);

      res.json({
        message: "Category updated successfully",
        category,
      });
    } catch (error) {
      console.error("Update category error:", error);
      res.status(500).json({ error: "Failed to update category" });
    }
  }

  /**
   * Delete category (Admin only)
   * DELETE /api/categories/:id
   */
  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Ensure param is string
      if (Array.isArray(id)) {
        return res.status(400).json({ error: "Invalid category ID" });
      }

      const category = await categoryRepository.findOne({
        where: { id: id as string },
        relations: ["courses"],
      });

      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      // Check if category has courses
      if (category.courses && category.courses.length > 0) {
        return res.status(400).json({
          error: "Cannot delete category with existing courses",
          coursesCount: category.courses.length,
        });
      }

      await categoryRepository.remove(category);

      res.json({ message: "Category deleted successfully" });
    } catch (error) {
      console.error("Delete category error:", error);
      res.status(500).json({ error: "Failed to delete category" });
    }
  }
}
