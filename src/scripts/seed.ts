import "reflect-metadata";
import { AppDataSource } from "../config/data-source";
import { Category } from "../entities/Category";
import { User } from "../entities/User";
import bcrypt from "bcryptjs";

async function seed() {
  try {
    // Initialize database connection
    await AppDataSource.initialize();
    console.log("✓ Database connected");

    // Seed Categories
    const categoryRepository = AppDataSource.getRepository(Category);
    
    const existingCategories = await categoryRepository.count();
    if (existingCategories === 0) {
      const categories = [
        {
          name: "Web Development",
          slug: "web-development",
          description: "Learn modern web development technologies",
          icon: "code",
          sortOrder: 1,
        },
        {
          name: "Data Science",
          slug: "data-science",
          description: "Master data science and analytics",
          icon: "chart",
          sortOrder: 2,
        },
        {
          name: "Mobile Development",
          slug: "mobile-development",
          description: "Build mobile applications for iOS and Android",
          icon: "mobile",
          sortOrder: 3,
        },
        {
          name: "Business",
          slug: "business",
          description: "Business and management courses",
          icon: "briefcase",
          sortOrder: 4,
        },
        {
          name: "Design",
          slug: "design",
          description: "UI/UX and graphic design",
          icon: "palette",
          sortOrder: 5,
        },
      ];

      await categoryRepository.save(categories);
      console.log("✓ Seeded 5 categories");
    } else {
      console.log("- Categories already exist, skipping");
    }

    // Seed Admin User
    const userRepository = AppDataSource.getRepository(User);
    
    const existingAdmin = await userRepository.findOne({
      where: { email: "admin@lms.com" },
    });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("Admin@123", 10);
      
      const admin = userRepository.create({
        email: "admin@lms.com",
        password: hashedPassword,
        firstName: "System",
        lastName: "Administrator",
        role: "admin",
        isActive: true,
        emailVerified: true,
      });

      await userRepository.save(admin);
      console.log("✓ Created admin user (admin@lms.com / Admin@123)");
    } else {
      console.log("- Admin user already exists, skipping");
    }

    // Seed Demo Instructor
    const existingInstructor = await userRepository.findOne({
      where: { email: "instructor@lms.com" },
    });

    if (!existingInstructor) {
      const hashedPassword = await bcrypt.hash("Instructor@123", 10);
      
      const instructor = userRepository.create({
        email: "instructor@lms.com",
        password: hashedPassword,
        firstName: "John",
        lastName: "Doe",
        role: "instructor",
        bio: "Experienced instructor with 10+ years in software development.",
        isActive: true,
        emailVerified: true,
      });

      await userRepository.save(instructor);
      console.log("✓ Created instructor user (instructor@lms.com / Instructor@123)");
    } else {
      console.log("- Instructor user already exists, skipping");
    }

    // Seed Demo Student
    const existingStudent = await userRepository.findOne({
      where: { email: "student@lms.com" },
    });

    if (!existingStudent) {
      const hashedPassword = await bcrypt.hash("Student@123", 10);
      
      const student = userRepository.create({
        email: "student@lms.com",
        password: hashedPassword,
        firstName: "Jane",
        lastName: "Smith",
        role: "student",
        isActive: true,
        emailVerified: true,
      });

      await userRepository.save(student);
      console.log("✓ Created student user (student@lms.com / Student@123)");
    } else {
      console.log("- Student user already exists, skipping");
    }

    console.log("\n✅ Database seeding completed successfully!");
    console.log("\nDemo Credentials:");
    console.log("- Admin: admin@lms.com / Admin@123");
    console.log("- Instructor: instructor@lms.com / Instructor@123");
    console.log("- Student: student@lms.com / Student@123");

  } catch (error) {
    console.error("✗ Seeding failed:", error);
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

seed();
