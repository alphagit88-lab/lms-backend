import "reflect-metadata";
import { AppDataSource } from "../config/data-source";
import { Category } from "../entities/Category";
import { User } from "../entities/User";
import { TeacherProfile } from "../entities/TeacherProfile";
import { Course } from "../entities/Course";
import { Class } from "../entities/Class";
import { Enrollment } from "../entities/Enrollment";
import { StudentProfile } from "../entities/StudentProfile";
import { Lesson } from "../entities/Lesson";
import { LessonProgress } from "../entities/LessonProgress";
import bcrypt from "bcryptjs";

async function seed() {
  try {
    // Initialize database connection
    await AppDataSource.initialize();
    console.log("✓ Database connected");

    const categoryRepository = AppDataSource.getRepository(Category);
    const userRepository = AppDataSource.getRepository(User);
    const teacherProfileRepository = AppDataSource.getRepository(TeacherProfile);
    const courseRepository = AppDataSource.getRepository(Course);
    const classRepository = AppDataSource.getRepository(Class);
    const enrollmentRepository = AppDataSource.getRepository(Enrollment);
    const studentProfileRepository = AppDataSource.getRepository(StudentProfile);
    const lessonRepository = AppDataSource.getRepository(Lesson);
    const lessonProgressRepository = AppDataSource.getRepository(LessonProgress);

    let instructorUser: any;
    let instructorUser2: any;
    let studentUser: any;
    let webDevCategory: any;
    let bootCampCourse: any;

    // Seed Categories
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

    webDevCategory = await categoryRepository.findOne({ where: { slug: "web-development" } });

    // Seed Admin User
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
    let instructor = await userRepository.findOne({
      where: { email: "instructor@lms.com" },
    });

    if (!instructor) {
      const hashedPassword = await bcrypt.hash("Instructor@123", 10);
      instructor = userRepository.create({
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
    instructorUser = instructor;

    // Seed Second Demo Instructor
    let instructor2 = await userRepository.findOne({
      where: { email: "sarah.web@lms.com" },
    });

    if (!instructor2) {
      const hashedPassword = await bcrypt.hash("Sarah@123", 10);
      instructor2 = userRepository.create({
        email: "sarah.web@lms.com",
        password: hashedPassword,
        firstName: "Sarah",
        lastName: "Connor",
        role: "instructor",
        bio: "UI/UX Expert and Frontend Specialist with a passion for teaching design principles.",
        isActive: true,
        emailVerified: true,
      });
      await userRepository.save(instructor2);
      console.log("✓ Created instructor user (sarah.web@lms.com / Sarah@123)");
    } else {
      console.log("- Second instructor user already exists, skipping");
    }
    instructorUser2 = instructor2;

    // Seed Demo Student
    let student = await userRepository.findOne({
      where: { email: "student@lms.com" },
    });

    if (!student) {
      const hashedPassword = await bcrypt.hash("Student@123", 10);
      student = userRepository.create({
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
    studentUser = student;

    // Seed Teacher Profile for Instructor 1
    if (instructorUser) {
      const existingProfile = await teacherProfileRepository.findOne({
        where: { teacherId: instructorUser.id }
      });

      if (!existingProfile) {
        const profile = teacherProfileRepository.create({
          teacherId: instructorUser.id,
          specialization: "Full Stack Web Development",
          qualifications: "MSc in Computer Science, 10+ years industry experience",
          yearsExperience: 12,
          rating: 4.8,
          ratingCount: 25,
          verified: true,
          hourlyRate: 50.00,
          teachingLanguages: "English, Sinhala",
          subjects: "React, Node.js, TypeScript, PostgreSQL",
          availabilityTimezone: "Asia/Colombo",
          totalSessions: 150,
          totalStudents: 500
        });
        await teacherProfileRepository.save(profile);
        console.log("✓ Created teacher profile for John Doe");
      }
    }

    // Seed Teacher Profile for Instructor 2
    if (instructorUser2) {
      const existingProfile2 = await teacherProfileRepository.findOne({
        where: { teacherId: instructorUser2.id }
      });

      if (!existingProfile2) {
        const profile2 = teacherProfileRepository.create({
          teacherId: instructorUser2.id,
          specialization: "UI/UX Design & Frontend Development",
          qualifications: "BFA in Graphic Design, Google UX Design Professional Certificate",
          yearsExperience: 8,
          rating: 4.9,
          ratingCount: 15,
          verified: true,
          hourlyRate: 45.00,
          teachingLanguages: "English",
          subjects: "Figma, Adobe XD, CSS Grid, Flexbox, Tailwind CSS",
          availabilityTimezone: "UTC",
          totalSessions: 80,
          totalStudents: 200
        });
        await teacherProfileRepository.save(profile2);
        console.log("✓ Created teacher profile for Sarah Connor");
      }
    }

    // Seed Student Profile for Demo Student
    if (studentUser) {
      const existingStudentProfile = await studentProfileRepository.findOne({
        where: { studentId: studentUser.id }
      });

      if (!existingStudentProfile) {
        const profile = studentProfileRepository.create({
          studentId: studentUser.id,
          grade: "Undergraduate",
          medium: "English",
          school: "LMS University",
          interests: "Web Development, UI/UX Design, Data Science",
          learningStyle: "Visual"
        });
        await studentProfileRepository.save(profile);
        console.log("✓ Created student profile for Jane Smith");
      }
    }

    // Seed Courses
    const existingCourses = await courseRepository.count();
    if (existingCourses === 0 && instructorUser && webDevCategory) {
      const courses = [
        {
          title: "Complete Web Development Bootcamp",
          slug: "complete-web-dev-bootcamp",
          description: "Learn everything you need to know about web development from scratch.",
          shortDescription: "Master HTML, CSS, JS, and React.",
          instructorId: instructorUser.id,
          categoryId: webDevCategory.id,
          status: "published",
          level: "beginner",
          medium: "english",
          durationHours: 40,
          price: 99.99,
          isPublished: true,
          publishedAt: new Date(),
          enrollmentCount: 150,
          ratingAverage: 4.5,
          ratingCount: 45
        },
        {
          title: "Advanced React Patterns",
          slug: "advanced-react-patterns",
          description: "Take your React skills to the next level with advanced patterns and performance optimization.",
          shortDescription: "Master hooks, context, and performance.",
          instructorId: instructorUser.id,
          categoryId: webDevCategory.id,
          status: "published",
          level: "advanced",
          medium: "english",
          durationHours: 15,
          price: 79.99,
          isPublished: true,
          publishedAt: new Date(),
          enrollmentCount: 85,
          ratingAverage: 4.9,
          ratingCount: 12
        }
      ];
      await courseRepository.save(courses);
      console.log("✓ Seeded 2 courses for John Doe");
    }

    if (instructorUser2 && webDevCategory) {
      const sarahCoursesCount = await courseRepository.count({ where: { instructorId: instructorUser2.id } });
      if (sarahCoursesCount === 0) {
        const sarahCourses = [
          {
            title: "UX Design Fundamentals",
            slug: "ux-design-fundamentals",
            description: "Learn the core principles of User Experience design from research to prototyping.",
            shortDescription: "Master the user-centric design process.",
            instructorId: instructorUser2.id,
            categoryId: webDevCategory.id,
            status: "published",
            level: "beginner",
            medium: "english",
            durationHours: 20,
            price: 59.99,
            isPublished: true,
            publishedAt: new Date(),
            enrollmentCount: 120,
            ratingAverage: 4.8,
            ratingCount: 30
          }
        ];
        await courseRepository.save(sarahCourses);
        console.log("✓ Seeded 1 course for Sarah Connor");
      }
    }

    // Seed Classes
    const existingClasses = await classRepository.count();
    if (existingClasses === 0 && instructorUser) {
      const classes = [
        {
          teacherId: instructorUser.id,
          subject: "Mathematics for Beginners",
          grade: "Grade 10",
          medium: "English",
          description: "Interactive online mathematics sessions covering algebra and geometry.",
          price: 25.00,
          maxStudents: 30,
          currentStudents: 12,
          isActive: true,
          isGroup: true
        },
        {
          teacherId: instructorUser.id,
          subject: "Science - Physics",
          grade: "A/L",
          medium: "Sinhala",
          description: "Advanced Level Physics coaching focusing on mechanics.",
          price: 35.00,
          maxStudents: 50,
          currentStudents: 20,
          isActive: true,
          isGroup: true
        }
      ];
      await classRepository.save(classes);
      console.log("✓ Seeded 2 classes for John Doe");
    }

    // Seed Enrollments
    bootCampCourse = await courseRepository.findOne({ where: { slug: "complete-web-dev-bootcamp" } });
    if (studentUser && bootCampCourse) {
      const existingEnrollment = await enrollmentRepository.findOne({
        where: { studentId: studentUser.id, courseId: bootCampCourse.id }
      });

      if (!existingEnrollment) {
        const enrollment = enrollmentRepository.create({
          studentId: studentUser.id,
          courseId: bootCampCourse.id,
          status: "active",
          progressPercentage: 25,
          enrolledAt: new Date()
        });
        await enrollmentRepository.save(enrollment);
        console.log("✓ Enrolled Jane Smith in Web Dev Bootcamp");
      }
    }

    // Seed Lessons
    if (bootCampCourse) {
      const existingLessons = await lessonRepository.count({ where: { courseId: bootCampCourse.id } });
      if (existingLessons === 0) {
        const lessons = [
          {
            courseId: bootCampCourse.id,
            title: "Introduction to Web Development",
            slug: "intro-to-web-dev",
            content: "In this lesson, we will cover the basics of how the web works.",
            videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            durationMinutes: 10,
            sortOrder: 1,
            isPreview: true,
            isPublished: true
          },
          {
            courseId: bootCampCourse.id,
            title: "HTML Fundamentals",
            slug: "html-fundamentals",
            content: "Learn the building blocks of the web: HTML tags and structure.",
            videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            durationMinutes: 45,
            sortOrder: 2,
            isPreview: false,
            isPublished: true
          }
        ];
        await lessonRepository.save(lessons);
        console.log("✓ Seeded lessons for Web Dev Bootcamp");
      }
    }

    // Seed Lesson Progress
    const bootCampEnrollment = await enrollmentRepository.findOne({
      where: { studentId: studentUser?.id, courseId: bootCampCourse?.id }
    });
    if (bootCampEnrollment) {
      const lessons = await lessonRepository.find({ where: { courseId: bootCampCourse?.id } });
      const existingProgress = await lessonProgressRepository.count({
        where: { enrollmentId: bootCampEnrollment.id }
      });

      if (existingProgress === 0 && lessons.length > 0) {
        const progress = [
          {
            enrollmentId: bootCampEnrollment.id,
            lessonId: lessons[0].id,
            isCompleted: true,
            completedAt: new Date(),
            timeSpentSeconds: 600
          }
        ];
        await lessonProgressRepository.save(progress);
        console.log("✓ Created lesson progress for Jane Smith");
      }
    }

    console.log("\n✅ Database seeding completed successfully!");
    console.log("\nDemo Credentials:");
    console.log("- Admin: admin@lms.com / Admin@123");
    console.log("- Instructor 1: instructor@lms.com / Instructor@123");
    console.log("- Instructor 2: sarah.web@lms.com / Sarah@123");
    console.log("- Student: student@lms.com / Student@123");

  } catch (error) {
    console.error("✗ Seeding failed:", error);
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

seed();
