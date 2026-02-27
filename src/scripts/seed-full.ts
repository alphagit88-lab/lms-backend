import "reflect-metadata";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { Category } from "../entities/Category";
import { TeacherProfile } from "../entities/TeacherProfile";
import { StudentProfile } from "../entities/StudentProfile";
import { ParentProfile, RelationshipType } from "../entities/ParentProfile";
import { Course } from "../entities/Course";
import { Lesson } from "../entities/Lesson";
import { Enrollment } from "../entities/Enrollment";
import { LessonProgress } from "../entities/LessonProgress";
import { Class } from "../entities/Class";
import { AvailabilitySlot, SlotStatus } from "../entities/AvailabilitySlot";
import { Booking, BookingStatus } from "../entities/Booking";
import { BookingPackage, PackageStatus } from "../entities/BookingPackage";
import { Session, SessionType, SessionStatus } from "../entities/Session";
import { Recording } from "../entities/Recording";
import { Content, ContentType } from "../entities/Content";
import { StudentParent, LinkStatus } from "../entities/StudentParent";
import { Payment, PaymentStatus, PaymentMethod, PaymentType } from "../entities/Payment";
import { Notification, NotificationChannel, NotificationType } from "../entities/Notification";
import bcrypt from "bcryptjs";

// ─────────────────────────────────────────────────────────
// Helper: Creates a date relative to today
// ─────────────────────────────────────────────────────────
function daysFromNow(days: number, hours = 0, minutes = 0): Date {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hours, minutes, 0, 0);
    return d;
}

function daysAgo(days: number, hours = 10, minutes = 0): Date {
    return daysFromNow(-days, hours, minutes);
}

async function seedFull() {
    try {
        await AppDataSource.initialize();
        console.log("✅ Database connected\n");

        // ─── Repositories ────────────────────────────────────
        const userRepo = AppDataSource.getRepository(User);
        const categoryRepo = AppDataSource.getRepository(Category);
        const teacherProfileRepo = AppDataSource.getRepository(TeacherProfile);
        const studentProfileRepo = AppDataSource.getRepository(StudentProfile);
        const parentProfileRepo = AppDataSource.getRepository(ParentProfile);
        const courseRepo = AppDataSource.getRepository(Course);
        const lessonRepo = AppDataSource.getRepository(Lesson);
        const enrollmentRepo = AppDataSource.getRepository(Enrollment);
        const lessonProgressRepo = AppDataSource.getRepository(LessonProgress);
        const classRepo = AppDataSource.getRepository(Class);
        const slotRepo = AppDataSource.getRepository(AvailabilitySlot);
        const bookingRepo = AppDataSource.getRepository(Booking);
        const packageRepo = AppDataSource.getRepository(BookingPackage);
        const sessionRepo = AppDataSource.getRepository(Session);
        const recordingRepo = AppDataSource.getRepository(Recording);
        const contentRepo = AppDataSource.getRepository(Content);
        const studentParentRepo = AppDataSource.getRepository(StudentParent);
        const paymentRepo = AppDataSource.getRepository(Payment);
        const notificationRepo = AppDataSource.getRepository(Notification);

        // ─── Wipe existing seed data (idempotent re-run) ─────
        console.log("🧹 Clearing existing data...\n");
        // Disable FK constraint checks so we can truncate in any order
        await AppDataSource.query(`SET session_replication_role = 'replica'`);
        const tables = [
            "notifications", "payments", "student_parents",
            "recordings", "sessions", "booking_packages", "bookings",
            "availability_slots", "lesson_progress", "enrollments",
            "lessons", "courses", "classes", "contents",
            "parent_profiles", "student_profiles", "teacher_profiles",
            "progress_reports", "answer_submissions", "question_options",
            "questions", "exams", "transactions",
            "categories", "users",
        ];
        for (const table of tables) {
            try {
                await AppDataSource.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
            } catch {
                // Table may not exist yet — skip silently
            }
        }
        // Re-enable FK constraint checks
        await AppDataSource.query(`SET session_replication_role = 'DEFAULT'`);
        console.log("  ✅ Database cleared\n");

        const hashedPassword = await bcrypt.hash("Test@1234", 10);

        // ═══════════════════════════════════════════════════════
        //  ACT 1 — THE PEOPLE
        // ═══════════════════════════════════════════════════════
        console.log("📖 ACT 1 — Creating the people of the LMS...\n");

        // ── Admin ──
        const admin = userRepo.create({
            email: "admin@lms.com",
            password: hashedPassword,
            firstName: "Kasun",
            lastName: "Rajapaksha",
            role: "admin",
            isActive: true,
            emailVerified: true,
        });

        // ── Instructors ──
        const instructors = [
            userRepo.create({
                email: "john.doe@lms.com",
                password: hashedPassword,
                firstName: "John",
                lastName: "Doe",
                role: "instructor",
                bio: "Full-Stack Developer with 12+ years in the industry. I make complex things simple.",
                isActive: true,
                emailVerified: true,
            }),
            userRepo.create({
                email: "sarah.connor@lms.com",
                password: hashedPassword,
                firstName: "Sarah",
                lastName: "Connor",
                role: "instructor",
                bio: "UI/UX Specialist & Creative Director. I believe great design tells a story.",
                isActive: true,
                emailVerified: true,
            }),
            userRepo.create({
                email: "nihal.silva@lms.com",
                password: hashedPassword,
                firstName: "Nihal",
                lastName: "Silva",
                role: "instructor",
                bio: "Mathematics teacher for O/L and A/L with 15 years of experience in Sri Lankan education.",
                isActive: true,
                emailVerified: true,
            }),
        ];

        // ── Students ──
        const students = [
            userRepo.create({
                email: "jane.smith@lms.com",
                password: hashedPassword,
                firstName: "Jane",
                lastName: "Smith",
                role: "student",
                isActive: true,
                emailVerified: true,
            }),
            userRepo.create({
                email: "amal.perera@lms.com",
                password: hashedPassword,
                firstName: "Amal",
                lastName: "Perera",
                role: "student",
                isActive: true,
                emailVerified: true,
            }),
            userRepo.create({
                email: "nimal.bandara@lms.com",
                password: hashedPassword,
                firstName: "Nimal",
                lastName: "Bandara",
                role: "student",
                isActive: true,
                emailVerified: true,
            }),
            userRepo.create({
                email: "sithara.fernando@lms.com",
                password: hashedPassword,
                firstName: "Sithara",
                lastName: "Fernando",
                role: "student",
                isActive: true,
                emailVerified: true,
            }),
            userRepo.create({
                email: "dilshan.jayawardena@lms.com",
                password: hashedPassword,
                firstName: "Dilshan",
                lastName: "Jayawardena",
                role: "student",
                isActive: true,
                emailVerified: true,
            }),
        ];

        // ── Parents ──
        const parents = [
            userRepo.create({
                email: "kamala.perera@lms.com",
                password: hashedPassword,
                firstName: "Kamala",
                lastName: "Perera",
                role: "parent",
                isActive: true,
                emailVerified: true,
            }),
            userRepo.create({
                email: "sunil.bandara@lms.com",
                password: hashedPassword,
                firstName: "Sunil",
                lastName: "Bandara",
                role: "parent",
                isActive: true,
                emailVerified: true,
            }),
        ];

        await userRepo.save(admin);
        await userRepo.save(instructors);
        await userRepo.save(students);
        await userRepo.save(parents);

        console.log("  👤 Created 1 Admin:       admin@lms.com");
        console.log("  👨‍🏫 Created 3 Instructors: john.doe, sarah.connor, nihal.silva");
        console.log("  🎓 Created 5 Students:    jane, amal, nimal, sithara, dilshan");
        console.log("  👨‍👩‍👧 Created 2 Parents:     kamala, sunil");

        // ── Teacher Profiles ──
        const teacherProfiles = [
            teacherProfileRepo.create({
                teacherId: instructors[0].id,
                specialization: "Full Stack Web Development",
                qualifications: "MSc Computer Science (University of Moratuwa), AWS Certified Developer",
                yearsExperience: 12,
                rating: 4.8,
                ratingCount: 127,
                verified: true,
                hourlyRate: 50.0,
                teachingLanguages: "English, Sinhala",
                subjects: "React, Node.js, TypeScript, PostgreSQL, Docker",
                availabilityTimezone: "Asia/Colombo",
                totalSessions: 340,
                totalStudents: 1250,
            }),
            teacherProfileRepo.create({
                teacherId: instructors[1].id,
                specialization: "UI/UX Design & Frontend Development",
                qualifications: "BFA Graphic Design, Google UX Design Certificate",
                yearsExperience: 8,
                rating: 4.9,
                ratingCount: 83,
                verified: true,
                hourlyRate: 45.0,
                teachingLanguages: "English",
                subjects: "Figma, Adobe XD, CSS, Tailwind CSS, Design Systems",
                availabilityTimezone: "Asia/Colombo",
                totalSessions: 180,
                totalStudents: 620,
            }),
            teacherProfileRepo.create({
                teacherId: instructors[2].id,
                specialization: "Mathematics (O/L & A/L)",
                qualifications: "BSc Mathematics (University of Colombo), PGDE",
                yearsExperience: 15,
                rating: 4.7,
                ratingCount: 210,
                verified: true,
                hourlyRate: 35.0,
                teachingLanguages: "Sinhala, English",
                subjects: "Pure Maths, Combined Maths, Statistics",
                availabilityTimezone: "Asia/Colombo",
                totalSessions: 520,
                totalStudents: 2100,
            }),
        ];
        await teacherProfileRepo.save(teacherProfiles);
        console.log("  📋 Created 3 teacher profiles\n");

        // ── Student Profiles ──
        const studentProfiles = [
            studentProfileRepo.create({ studentId: students[0].id, grade: "Undergraduate", medium: "English", school: "University of Colombo", interests: "Web Development, Startups", learningStyle: "Visual" }),
            studentProfileRepo.create({ studentId: students[1].id, grade: "A/L", medium: "Sinhala", school: "Royal College, Colombo", interests: "Mathematics, Engineering", learningStyle: "Kinesthetic" }),
            studentProfileRepo.create({ studentId: students[2].id, grade: "A/L", medium: "Sinhala", school: "Ananda College, Colombo", interests: "Science, Mathematics", learningStyle: "Auditory" }),
            studentProfileRepo.create({ studentId: students[3].id, grade: "O/L", medium: "English", school: "Visakha Vidyalaya, Colombo", interests: "Design, Art, UI/UX", learningStyle: "Visual" }),
            studentProfileRepo.create({ studentId: students[4].id, grade: "Undergraduate", medium: "English", school: "SLIIT", interests: "Software Engineering, Cloud", learningStyle: "Reading" }),
        ];
        await studentProfileRepo.save(studentProfiles);

        // ── Parent Profiles ──
        const parentProfiles = [
            parentProfileRepo.create({ parentId: parents[0].id, relationship: RelationshipType.MOTHER, occupation: "Accountant", emergencyContact: "+94771234567", preferredLanguage: "Sinhala" }),
            parentProfileRepo.create({ parentId: parents[1].id, relationship: RelationshipType.FATHER, occupation: "Engineer", emergencyContact: "+94779876543", preferredLanguage: "Sinhala" }),
        ];
        await parentProfileRepo.save(parentProfiles);

        // ── Parent–Student Links ──
        const links = [
            studentParentRepo.create({ studentId: students[1].id, parentId: parents[0].id, status: LinkStatus.ACCEPTED, message: "I am Amal's mother", acceptedAt: daysAgo(20) }),
            studentParentRepo.create({ studentId: students[2].id, parentId: parents[1].id, status: LinkStatus.ACCEPTED, message: "I am Nimal's father", acceptedAt: daysAgo(18) }),
            studentParentRepo.create({ studentId: students[3].id, parentId: parents[0].id, status: LinkStatus.PENDING, message: "I am also Sithara's guardian" }),
        ];
        await studentParentRepo.save(links);
        console.log("  🔗 Created 3 parent-student links (2 accepted, 1 pending)");

        // ═══════════════════════════════════════════════════════
        //  ACT 2 — THE COURSES & LESSONS
        // ═══════════════════════════════════════════════════════
        console.log("\n📖 ACT 2 — Building the course catalog...\n");

        // ── Categories ──
        const categories = [
            categoryRepo.create({ name: "Web Development", slug: "web-development", description: "Learn modern web development technologies", icon: "code", sortOrder: 1 }),
            categoryRepo.create({ name: "Data Science", slug: "data-science", description: "Master data science and analytics", icon: "chart", sortOrder: 2 }),
            categoryRepo.create({ name: "Mobile Development", slug: "mobile-development", description: "Build mobile apps for iOS and Android", icon: "mobile", sortOrder: 3 }),
            categoryRepo.create({ name: "Mathematics", slug: "mathematics", description: "Strengthen mathematical foundations", icon: "calculator", sortOrder: 4 }),
            categoryRepo.create({ name: "Design", slug: "design", description: "UI/UX and graphic design", icon: "palette", sortOrder: 5 }),
        ];
        await categoryRepo.save(categories);
        console.log("  📂 Created 5 categories");

        // ── Courses ──
        const courses = [
            courseRepo.create({
                title: "Complete Web Development Bootcamp 2026",
                slug: "complete-web-dev-bootcamp-2026",
                description: "Go from zero to full-stack hero. This course covers HTML, CSS, JavaScript, React, Node.js, PostgreSQL, Docker, and deployment. You'll build 10+ real-world projects along the way.",
                shortDescription: "Master full-stack web development from scratch.",
                instructorId: instructors[0].id,
                categoryId: categories[0].id,
                status: "published", level: "beginner", medium: "english",
                durationHours: 60, price: 99.99, isPublished: true, publishedAt: daysAgo(90),
                enrollmentCount: 342, ratingAverage: 4.7, ratingCount: 127,
            }),
            courseRepo.create({
                title: "Advanced React & Next.js Patterns",
                slug: "advanced-react-nextjs-patterns",
                description: "Take your React skills to the next level. Learn Server Components, App Router, advanced hooks patterns, state machines, and performance optimization techniques.",
                shortDescription: "Deep-dive into modern React architecture.",
                instructorId: instructors[0].id,
                categoryId: categories[0].id,
                status: "published", level: "advanced", medium: "english",
                durationHours: 20, price: 79.99, isPublished: true, publishedAt: daysAgo(45),
                enrollmentCount: 156, ratingAverage: 4.9, ratingCount: 53,
            }),
            courseRepo.create({
                title: "UX Design Fundamentals",
                slug: "ux-design-fundamentals",
                description: "Learn the art of user-centered design. From research and personas to wireframes, prototypes, and usability testing using Figma.",
                shortDescription: "Master user experience design from idea to prototype.",
                instructorId: instructors[1].id,
                categoryId: categories[4].id,
                status: "published", level: "beginner", medium: "english",
                durationHours: 25, price: 59.99, isPublished: true, publishedAt: daysAgo(60),
                enrollmentCount: 218, ratingAverage: 4.8, ratingCount: 83,
            }),
            courseRepo.create({
                title: "Design Systems with Figma",
                slug: "design-systems-figma",
                description: "Build scalable, consistent design systems. Learn tokens, components, variants, and auto-layout in Figma. Handoff like a pro.",
                shortDescription: "Build production-grade design systems.",
                instructorId: instructors[1].id,
                categoryId: categories[4].id,
                status: "published", level: "intermediate", medium: "english",
                durationHours: 15, price: 49.99, isPublished: true, publishedAt: daysAgo(30),
                enrollmentCount: 89, ratingAverage: 4.6, ratingCount: 24,
            }),
            courseRepo.create({
                title: "Combined Mathematics for A/L (2026)",
                slug: "combined-maths-al-2026",
                description: "A complete preparation course for the GCE Advanced Level Combined Mathematics exam. Covers Pure Mathematics and Applied Mathematics with worked examples and past papers.",
                shortDescription: "Ace your A/L Combined Maths exam.",
                instructorId: instructors[2].id,
                categoryId: categories[3].id,
                status: "published", level: "advanced", medium: "english",
                durationHours: 100, price: 149.99, isPublished: true, publishedAt: daysAgo(120),
                enrollmentCount: 478, ratingAverage: 4.7, ratingCount: 210,
            }),
        ];
        await courseRepo.save(courses);
        console.log("  📚 Created 5 courses across 3 instructors");

        // ── Lessons (for Web Dev Bootcamp) ──
        const bootcampLessons = [
            { title: "Welcome & Course Roadmap", slug: "welcome-course-roadmap", content: "Welcome to the course! In this lesson, we go through the curriculum, tools you need, and how to get the best out of this bootcamp.", durationMinutes: 8, sortOrder: 1, isPreview: true, isPublished: true },
            { title: "How the Web Works — HTTP, DNS, Servers", slug: "how-the-web-works", content: "Before we write code, let's understand the infrastructure: what happens when you type a URL and press Enter.", durationMinutes: 22, sortOrder: 2, isPreview: true, isPublished: true },
            { title: "HTML Foundations — Structure of Every Page", slug: "html-foundations", content: "Learn HTML5 semantic tags: header, nav, main, section, article, footer. Build a well-structured personal portfolio page.", durationMinutes: 45, sortOrder: 3, isPreview: false, isPublished: true },
            { title: "CSS Box Model & Flexbox", slug: "css-box-model-flexbox", content: "Master the CSS Box Model (margin, border, padding, content). Then learn Flexbox to create responsive layouts.", durationMinutes: 50, sortOrder: 4, isPreview: false, isPublished: true },
            { title: "CSS Grid — The Two-Dimensional Layout", slug: "css-grid", content: "Transition from Flexbox to Grid. Build a responsive dashboard layout using CSS Grid.", durationMinutes: 40, sortOrder: 5, isPreview: false, isPublished: true },
            { title: "JavaScript Essentials — Variables, Functions, Arrays", slug: "js-essentials", content: "Introduction to JavaScript fundamentals. Variables (let, const), data types, functions (arrow functions), and arrays.", durationMinutes: 55, sortOrder: 6, isPreview: false, isPublished: true },
            { title: "DOM Manipulation — Making Pages Dynamic", slug: "dom-manipulation", content: "Learn to select, modify, and create DOM elements. Event listeners, forms, and building an interactive to-do list.", durationMinutes: 60, sortOrder: 7, isPreview: false, isPublished: true },
            { title: "Async JavaScript — Promises, Fetch, & APIs", slug: "async-javascript", content: "Understand the event loop, promises, async/await, and making API calls with fetch(). Build a weather app.", durationMinutes: 50, sortOrder: 8, isPreview: false, isPublished: true },
            { title: "Introduction to React — Components & JSX", slug: "intro-to-react", content: "Set up React with Vite. Learn components, JSX, props, and conditionally rendered content.", durationMinutes: 55, sortOrder: 9, isPreview: false, isPublished: true },
            { title: "React State & Hooks Deep-Dive", slug: "react-state-hooks", content: "Learn useState, useEffect, useRef, and useMemo. Build a recipe finder app with state management.", durationMinutes: 60, sortOrder: 10, isPreview: false, isPublished: true },
        ];
        const savedLessons = await lessonRepo.save(
            bootcampLessons.map((l) => lessonRepo.create({ ...l, courseId: courses[0].id, videoUrl: "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4" }))
        );
        console.log(`  📝 Created ${savedLessons.length} lessons for Web Dev Bootcamp`);

        // ── Enrollments ──
        const enrollments = [
            enrollmentRepo.create({ studentId: students[0].id, courseId: courses[0].id, status: "active", progressPercentage: 70, enrolledAt: daysAgo(60) }),
            enrollmentRepo.create({ studentId: students[0].id, courseId: courses[2].id, status: "active", progressPercentage: 40, enrolledAt: daysAgo(30) }),
            enrollmentRepo.create({ studentId: students[4].id, courseId: courses[0].id, status: "active", progressPercentage: 30, enrolledAt: daysAgo(40) }),
            enrollmentRepo.create({ studentId: students[4].id, courseId: courses[1].id, status: "active", progressPercentage: 10, enrolledAt: daysAgo(15) }),
            enrollmentRepo.create({ studentId: students[3].id, courseId: courses[2].id, status: "active", progressPercentage: 85, enrolledAt: daysAgo(50) }),
            enrollmentRepo.create({ studentId: students[3].id, courseId: courses[3].id, status: "active", progressPercentage: 20, enrolledAt: daysAgo(10) }),
            enrollmentRepo.create({ studentId: students[1].id, courseId: courses[4].id, status: "active", progressPercentage: 55, enrolledAt: daysAgo(100) }),
            enrollmentRepo.create({ studentId: students[2].id, courseId: courses[4].id, status: "active", progressPercentage: 45, enrolledAt: daysAgo(95) }),
        ];
        const savedEnrollments = await enrollmentRepo.save(enrollments);
        console.log(`  🎟️ Created ${savedEnrollments.length} enrollments`);

        // ── Lesson Progress (Jane has completed 7 of 10 lessons) ──
        const janeEnrollment = savedEnrollments[0]; // Jane → Web Dev Bootcamp
        const progressRecords = savedLessons.slice(0, 7).map((lesson, index) =>
            lessonProgressRepo.create({
                enrollmentId: janeEnrollment.id,
                lessonId: lesson.id,
                isCompleted: true,
                completedAt: daysAgo(60 - index * 5),
                timeSpentSeconds: (lesson.durationMinutes ?? 0) * 60 + Math.floor(Math.random() * 300),
            })
        );
        await lessonProgressRepo.save(progressRecords);
        console.log("  📊 Created lesson progress: Jane completed 7/10 lessons");

        // ═══════════════════════════════════════════════════════
        //  ACT 3 — THE LIVE CLASSES
        // ═══════════════════════════════════════════════════════
        console.log("\n📖 ACT 3 — Setting up live classes...\n");

        // ── Classes ──
        const classes = [
            classRepo.create({ teacherId: instructors[0].id, subject: "React & Node.js Masterclass", grade: "Undergraduate", medium: "English", description: "Weekly live coding sessions building a full SaaS product with React 19 and Node.", price: 40.0, maxStudents: 25, currentStudents: 18, isActive: true, isGroup: true }),
            classRepo.create({ teacherId: instructors[2].id, subject: "Combined Mathematics", grade: "A/L", medium: "Sinhala", description: "A/L Combined Maths group class covering Pure and Applied modules with weekly past-paper practice.", price: 25.0, maxStudents: 40, currentStudents: 32, isActive: true, isGroup: true }),
            classRepo.create({ teacherId: instructors[2].id, subject: "O/L Mathematics", grade: "Grade 10", medium: "English", description: "O/L Maths preparation class focussing on Algebra, Geometry and Trigonometry.", price: 20.0, maxStudents: 30, currentStudents: 22, isActive: true, isGroup: true }),
            classRepo.create({ teacherId: instructors[1].id, subject: "UI/UX Portfolio Workshop", grade: "Undergraduate", medium: "English", description: "One-on-one design portfolio review and mentoring sessions.", price: 60.0, maxStudents: 1, currentStudents: 1, isActive: true, isGroup: false }),
        ];
        const savedClasses = await classRepo.save(classes);
        console.log("  🏫 Created 4 classes");

        // ── Availability Slots (for the coming week) ──
        const slots: AvailabilitySlot[] = [];
        for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
            // John — morning & afternoon slots
            slots.push(slotRepo.create({ teacherId: instructors[0].id, startTime: daysFromNow(dayOffset, 9, 0), endTime: daysFromNow(dayOffset, 10, 0), status: SlotStatus.AVAILABLE, maxBookings: 1, currentBookings: 0, price: 50.0 }));
            slots.push(slotRepo.create({ teacherId: instructors[0].id, startTime: daysFromNow(dayOffset, 14, 0), endTime: daysFromNow(dayOffset, 15, 0), status: SlotStatus.AVAILABLE, maxBookings: 1, currentBookings: 0, price: 50.0 }));
            // Nihal — evening slot
            slots.push(slotRepo.create({ teacherId: instructors[2].id, startTime: daysFromNow(dayOffset, 18, 0), endTime: daysFromNow(dayOffset, 19, 0), status: SlotStatus.AVAILABLE, maxBookings: 5, currentBookings: 0, price: 25.0 }));
        }
        // Some past slots (already booked/completed)
        for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
            slots.push(slotRepo.create({ teacherId: instructors[0].id, startTime: daysAgo(dayOffset, 9, 0), endTime: daysAgo(dayOffset, 10, 0), status: SlotStatus.BOOKED, maxBookings: 1, currentBookings: 1, price: 50.0 }));
        }
        const savedSlots = await slotRepo.save(slots);
        console.log(`  🕐 Created ${savedSlots.length} availability slots (${7 * 3} upcoming, 5 past)`);

        // ── Bookings (past confirmed + upcoming pending) ──
        const pastSlots = savedSlots.filter((s) => s.status === SlotStatus.BOOKED);
        const futureSlots = savedSlots.filter((s) => s.status === SlotStatus.AVAILABLE);

        const bookings = [
            // Past completed bookings
            ...pastSlots.slice(0, 3).map((slot, i) =>
                bookingRepo.create({
                    slotId: slot.id,
                    studentId: students[0].id, // Jane
                    teacherId: instructors[0].id,
                    bookedById: students[0].id,
                    status: BookingStatus.COMPLETED,
                    sessionStartTime: slot.startTime,
                    sessionEndTime: slot.endTime,
                    amount: 50.0,
                    meetingLink: "https://zoom.us/j/1234567890",
                    notes: `Session ${i + 1} with John — React coaching`,
                })
            ),
            // A past no-show
            bookingRepo.create({
                slotId: pastSlots[3].id,
                studentId: students[4].id, // Dilshan
                teacherId: instructors[0].id,
                bookedById: students[4].id,
                status: BookingStatus.NO_SHOW,
                sessionStartTime: pastSlots[3].startTime,
                sessionEndTime: pastSlots[3].endTime,
                amount: 50.0,
                notes: "Dilshan missed the session",
            }),
            // Upcoming confirmed bookings
            bookingRepo.create({
                slotId: futureSlots[0].id,
                studentId: students[0].id, // Jane
                teacherId: instructors[0].id,
                bookedById: students[0].id,
                status: BookingStatus.CONFIRMED,
                sessionStartTime: futureSlots[0].startTime,
                sessionEndTime: futureSlots[0].endTime,
                amount: 50.0,
                meetingLink: "https://zoom.us/j/9876543210",
            }),
            bookingRepo.create({
                slotId: futureSlots[2].id,
                studentId: students[1].id, // Amal
                teacherId: instructors[2].id,
                bookedById: parents[0].id, // Booked by parent
                status: BookingStatus.CONFIRMED,
                sessionStartTime: futureSlots[2].startTime,
                sessionEndTime: futureSlots[2].endTime,
                amount: 25.0,
                notes: "Booked by Kamala (parent) for Amal",
            }),
            // Pending booking
            bookingRepo.create({
                slotId: futureSlots[4].id,
                studentId: students[2].id, // Nimal
                teacherId: instructors[0].id,
                bookedById: parents[1].id, // Booked by parent
                status: BookingStatus.PENDING,
                sessionStartTime: futureSlots[4].startTime,
                sessionEndTime: futureSlots[4].endTime,
                amount: 50.0,
                notes: "Booked by Sunil (parent) for Nimal",
            }),
        ];
        // Update slot statuses for booked future slots
        futureSlots[0].status = SlotStatus.BOOKED;
        futureSlots[0].currentBookings = 1;
        futureSlots[2].currentBookings = 1;
        futureSlots[4].currentBookings = 1;
        await slotRepo.save([futureSlots[0], futureSlots[2], futureSlots[4]]);

        const savedBookings = await bookingRepo.save(bookings);
        console.log(`  📅 Created ${savedBookings.length} bookings (3 completed, 1 no-show, 2 confirmed, 1 pending)`);

        // ── Booking Packages ──
        const packages = [
            packageRepo.create({
                teacherId: instructors[0].id,
                studentId: students[0].id,
                bookedById: students[0].id,
                title: "React Coaching — 10 Sessions",
                totalSessions: 10,
                completedSessions: 3,
                cancelledSessions: 0,
                totalPrice: 500.0,
                discountPercentage: 10,
                finalPrice: 450.0,
                status: PackageStatus.ACTIVE,
                notes: "10 one-hour sessions to go from React beginner to advanced.",
            }),
            packageRepo.create({
                teacherId: instructors[2].id,
                studentId: students[1].id,
                bookedById: parents[0].id,
                title: "A/L Maths Revision — 20 Sessions",
                totalSessions: 20,
                completedSessions: 12,
                cancelledSessions: 1,
                totalPrice: 500.0,
                discountPercentage: 15,
                finalPrice: 425.0,
                status: PackageStatus.ACTIVE,
                notes: "Weekly sessions covering past papers and theory revision for A/L 2026 exam.",
            }),
        ];
        await packageRepo.save(packages);
        console.log("  📦 Created 2 booking packages");

        // ═══════════════════════════════════════════════════════
        //  ACT 4 — THE LIVE SESSIONS & RECORDINGS
        // ═══════════════════════════════════════════════════════
        console.log("\n📖 ACT 4 — Conducting live sessions...\n");

        // ── Sessions (past & upcoming) ──
        const sessions = [
            // Past completed sessions
            sessionRepo.create({ classId: savedClasses[0].id, title: "Week 1: Setting Up the Project", description: "Initialize a monorepo with React frontend and Express backend.", startTime: daysAgo(14, 9, 0), endTime: daysAgo(14, 10, 30), sessionType: SessionType.LIVE, status: SessionStatus.COMPLETED, meetingLink: "https://zoom.us/j/111111", isRecorded: true, attendanceCount: 15 }),
            sessionRepo.create({ classId: savedClasses[0].id, title: "Week 2: Authentication & JWT", description: "Implement login, register, and protected routes.", startTime: daysAgo(7, 9, 0), endTime: daysAgo(7, 10, 30), sessionType: SessionType.LIVE, status: SessionStatus.COMPLETED, meetingLink: "https://zoom.us/j/222222", isRecorded: true, attendanceCount: 17 }),
            sessionRepo.create({ classId: savedClasses[1].id, title: "Differential Equations — Part 1", description: "Introduction to first-order ODEs with examples.", startTime: daysAgo(5, 18, 0), endTime: daysAgo(5, 19, 30), sessionType: SessionType.LIVE, status: SessionStatus.COMPLETED, meetingLink: "https://zoom.us/j/333333", isRecorded: true, attendanceCount: 28 }),
            // Upcoming sessions
            sessionRepo.create({ classId: savedClasses[0].id, title: "Week 3: Database & ORM Setup", description: "Set up PostgreSQL with TypeORM, create entities, and run migrations.", startTime: daysFromNow(1, 9, 0), endTime: daysFromNow(1, 10, 30), sessionType: SessionType.LIVE, status: SessionStatus.SCHEDULED, meetingLink: "https://zoom.us/j/444444" }),
            sessionRepo.create({ classId: savedClasses[1].id, title: "Differential Equations — Part 2", description: "Second-order ODEs with constant coefficients.", startTime: daysFromNow(2, 18, 0), endTime: daysFromNow(2, 19, 30), sessionType: SessionType.LIVE, status: SessionStatus.SCHEDULED, meetingLink: "https://zoom.us/j/555555" }),
            sessionRepo.create({ classId: savedClasses[2].id, title: "Algebra Revision — Quadratic Equations", description: "Revise solving quadratic equations using formula, factorization, and completing the square.", startTime: daysFromNow(3, 16, 0), endTime: daysFromNow(3, 17, 0), sessionType: SessionType.LIVE, status: SessionStatus.SCHEDULED }),
        ];
        const savedSessions = await sessionRepo.save(sessions);
        console.log(`  🎬 Created ${savedSessions.length} sessions (3 completed, 3 upcoming)`);

        // ── Recordings ──
        const recordings = [
            recordingRepo.create({ sessionId: savedSessions[0].id, fileUrl: "https://cdn.lms.com/recordings/week1-project-setup.mp4", fileSize: 524288000, durationMinutes: 88, videoQuality: "1080p", isProcessed: true, isPublic: true, viewCount: 42, uploadedAt: daysAgo(13) }),
            recordingRepo.create({ sessionId: savedSessions[1].id, fileUrl: "https://cdn.lms.com/recordings/week2-auth-jwt.mp4", fileSize: 612000000, durationMinutes: 92, videoQuality: "1080p", isProcessed: true, isPublic: true, viewCount: 38, uploadedAt: daysAgo(6) }),
            recordingRepo.create({ sessionId: savedSessions[2].id, fileUrl: "https://cdn.lms.com/recordings/diff-eq-part1.mp4", fileSize: 480000000, durationMinutes: 85, videoQuality: "720p", isProcessed: true, isPublic: false, viewCount: 65, uploadedAt: daysAgo(4) }),
        ];
        await recordingRepo.save(recordings);
        console.log("  📹 Created 3 recordings for completed sessions");

        // ═══════════════════════════════════════════════════════
        //  ACT 5 — CONTENT LIBRARY
        // ═══════════════════════════════════════════════════════
        console.log("\n📖 ACT 5 — Uploading content to the library...\n");

        const contents = [
            contentRepo.create({ teacherId: instructors[0].id, contentType: ContentType.PDF, title: "React Cheat Sheet 2026", description: "A concise 4-page PDF with all React hooks, patterns, and best practices.", language: "English", fileUrl: "https://cdn.lms.com/content/react-cheatsheet-2026.pdf", fileSize: 2500000, isPaid: false, isPublished: true, isDownloadable: true, downloadCount: 234, viewCount: 890, subject: "Web Development", grade: "Undergraduate" }),
            contentRepo.create({ teacherId: instructors[0].id, contentType: ContentType.VIDEO, title: "Node.js + Docker — Deployment Guide", description: "Step-by-step video on containerizing a Node.js app and deploying to AWS.", language: "English", fileUrl: "https://cdn.lms.com/content/nodejs-docker-guide.mp4", fileSize: 350000000, isPaid: true, price: 9.99, isPublished: true, isDownloadable: false, downloadCount: 0, viewCount: 456, subject: "DevOps", grade: "Professional" }),
            contentRepo.create({ teacherId: instructors[1].id, contentType: ContentType.PRESENTATION, title: "Design Thinking Workshop Slides", description: "40-slide presentation covering the 5 phases of Design Thinking with real case studies.", language: "English", fileUrl: "https://cdn.lms.com/content/design-thinking-slides.pptx", fileSize: 15000000, isPaid: false, isPublished: true, isDownloadable: true, downloadCount: 167, viewCount: 512, subject: "Design", grade: "Undergraduate" }),
            contentRepo.create({ teacherId: instructors[1].id, contentType: ContentType.PDF, title: "Figma Shortcuts & Tips", description: "A printable guide of 50+ Figma shortcuts and hidden features.", language: "English", fileUrl: "https://cdn.lms.com/content/figma-shortcuts.pdf", fileSize: 1800000, isPaid: false, isPublished: true, isDownloadable: true, downloadCount: 312, viewCount: 780, subject: "Design Tools", grade: "All Levels" }),
            contentRepo.create({ teacherId: instructors[2].id, contentType: ContentType.PDF, title: "A/L Combined Maths — 2025 Past Paper (Worked)", description: "Full worked solutions for the 2025 A/L Combined Maths paper.", language: "English", fileUrl: "https://cdn.lms.com/content/al-maths-2025-pastpaper.pdf", fileSize: 8500000, isPaid: true, price: 4.99, isPublished: true, isDownloadable: true, downloadCount: 487, viewCount: 1250, subject: "Mathematics", grade: "A/L" }),
            contentRepo.create({ teacherId: instructors[2].id, contentType: ContentType.WORKSHEET, title: "O/L Algebra Practice Worksheet", description: "50 problems covering algebraic expressions, equations, and inequalities.", language: "English", fileUrl: "https://cdn.lms.com/content/ol-algebra-worksheet.pdf", fileSize: 950000, isPaid: false, isPublished: true, isDownloadable: true, downloadCount: 189, viewCount: 620, subject: "Mathematics", grade: "Grade 10" }),
            contentRepo.create({ teacherId: instructors[0].id, contentType: ContentType.VIDEO, title: "TypeScript Generics Explained", description: "A 25-minute deep-dive into TypeScript generics with practical examples.", language: "English", fileUrl: "https://cdn.lms.com/content/ts-generics.mp4", fileSize: 180000000, isPaid: false, isPublished: true, isDownloadable: false, viewCount: 345, subject: "Web Development", grade: "Intermediate" }),
        ];
        await contentRepo.save(contents);
        console.log(`  📄 Created ${contents.length} content items (PDFs, videos, presentations, worksheets)`);

        // ═══════════════════════════════════════════════════════
        //  ACT 6 — PAYMENTS
        // ═══════════════════════════════════════════════════════
        console.log("\n📖 ACT 6 — Processing payments...\n");

        const payments = [
            paymentRepo.create({ userId: students[0].id, paymentType: PaymentType.COURSE_ENROLLMENT, referenceId: courses[0].id, recipientId: instructors[0].id, amount: 99.99, platformFee: 15.0, currency: "USD", paymentMethod: PaymentMethod.STRIPE, paymentStatus: PaymentStatus.COMPLETED, transactionId: "txn_stripe_001", paymentDate: daysAgo(60) }),
            paymentRepo.create({ userId: students[0].id, paymentType: PaymentType.COURSE_ENROLLMENT, referenceId: courses[2].id, recipientId: instructors[1].id, amount: 59.99, platformFee: 9.0, currency: "USD", paymentMethod: PaymentMethod.CREDIT_CARD, paymentStatus: PaymentStatus.COMPLETED, transactionId: "txn_cc_002", paymentDate: daysAgo(30) }),
            paymentRepo.create({ userId: students[0].id, paymentType: PaymentType.BOOKING_SESSION, referenceId: savedBookings[0].id, recipientId: instructors[0].id, amount: 50.0, platformFee: 7.5, currency: "USD", paymentMethod: PaymentMethod.STRIPE, paymentStatus: PaymentStatus.COMPLETED, transactionId: "txn_stripe_003", paymentDate: daysAgo(5) }),
            paymentRepo.create({ userId: parents[0].id, paymentType: PaymentType.BOOKING_SESSION, referenceId: savedBookings[5].id, recipientId: instructors[2].id, amount: 25.0, platformFee: 3.75, currency: "USD", paymentMethod: PaymentMethod.BANK_TRANSFER, paymentStatus: PaymentStatus.COMPLETED, transactionId: "txn_bank_004", paymentDate: daysAgo(2) }),
            paymentRepo.create({ userId: students[4].id, paymentType: PaymentType.COURSE_ENROLLMENT, referenceId: courses[0].id, recipientId: instructors[0].id, amount: 99.99, platformFee: 15.0, currency: "USD", paymentMethod: PaymentMethod.STRIPE, paymentStatus: PaymentStatus.COMPLETED, transactionId: "txn_stripe_005", paymentDate: daysAgo(40) }),
            paymentRepo.create({ userId: students[1].id, paymentType: PaymentType.CONTENT_PURCHASE, referenceId: contents[4].id, recipientId: instructors[2].id, amount: 4.99, platformFee: 0.75, currency: "USD", paymentMethod: PaymentMethod.CREDIT_CARD, paymentStatus: PaymentStatus.COMPLETED, transactionId: "txn_cc_006", paymentDate: daysAgo(10) }),
            // A failed payment
            paymentRepo.create({ userId: students[2].id, paymentType: PaymentType.COURSE_ENROLLMENT, referenceId: courses[4].id, recipientId: instructors[2].id, amount: 149.99, platformFee: 22.5, currency: "USD", paymentMethod: PaymentMethod.CREDIT_CARD, paymentStatus: PaymentStatus.FAILED, failureReason: "Card declined — insufficient funds", paymentDate: daysAgo(95) }),
        ];
        await paymentRepo.save(payments);
        console.log(`  💳 Created ${payments.length} payment records (6 completed, 1 failed)`);

        // ═══════════════════════════════════════════════════════
        //  ACT 7 — NOTIFICATIONS
        // ═══════════════════════════════════════════════════════
        console.log("\n📖 ACT 7 — Sending notifications...\n");

        const notifications = [
            notificationRepo.create({ userId: students[0].id, channel: NotificationChannel.IN_APP, notificationType: NotificationType.BOOKING_CONFIRMED, title: "Booking Confirmed!", message: "Your session with John Doe on " + futureSlots[0].startTime.toLocaleDateString() + " has been confirmed.", actionUrl: "/bookings", sentAt: daysAgo(1), isRead: false }),
            notificationRepo.create({ userId: students[0].id, channel: NotificationChannel.IN_APP, notificationType: NotificationType.COURSE_ENROLLED, title: "Welcome to Web Dev Bootcamp!", message: "You've been enrolled in the Complete Web Development Bootcamp. Start your first lesson now.", actionUrl: "/courses", sentAt: daysAgo(60), isRead: true, readAt: daysAgo(60) }),
            notificationRepo.create({ userId: students[1].id, channel: NotificationChannel.IN_APP, notificationType: NotificationType.BOOKING_CONFIRMED, title: "Session Booked by Parent", message: "Your parent Kamala has booked a Maths session with Mr. Nihal Silva for you.", actionUrl: "/bookings", sentAt: daysAgo(2), isRead: true, readAt: daysAgo(2) }),
            notificationRepo.create({ userId: parents[0].id, channel: NotificationChannel.IN_APP, notificationType: NotificationType.PAYMENT_SUCCESS, title: "Payment Successful", message: "Payment of LKR 6,500 for Amal's Maths session has been processed successfully.", actionUrl: "/parent", sentAt: daysAgo(2), isRead: false }),
            notificationRepo.create({ userId: instructors[0].id, channel: NotificationChannel.IN_APP, notificationType: NotificationType.BOOKING_CONFIRMED, title: "New Booking Received", message: "Jane Smith has booked a 1-on-1 session with you for " + futureSlots[0].startTime.toLocaleDateString() + ".", actionUrl: "/instructor/bookings", sentAt: daysAgo(1), isRead: false }),
            notificationRepo.create({ userId: instructors[2].id, channel: NotificationChannel.IN_APP, notificationType: NotificationType.SESSION_STARTED, title: "Session Starting Soon", message: "Your Differential Equations Part 2 session starts in 30 minutes.", actionUrl: "/instructor/sessions", sentAt: new Date(), isRead: false }),
            notificationRepo.create({ userId: students[0].id, channel: NotificationChannel.IN_APP, notificationType: NotificationType.BOOKING_REMINDER, title: "Upcoming Session Tomorrow", message: "Reminder: You have a session with John Doe tomorrow at 9:00 AM.", actionUrl: "/sessions", sentAt: new Date(), isRead: false }),
        ];
        await notificationRepo.save(notifications);
        console.log(`  🔔 Created ${notifications.length} notifications`);

        // ═══════════════════════════════════════════════════════
        //  FINALE — SUMMARY
        // ═══════════════════════════════════════════════════════
        console.log("\n═══════════════════════════════════════════════════════");
        console.log("  🎉  FULL SEED COMPLETED SUCCESSFULLY!");
        console.log("═══════════════════════════════════════════════════════\n");
        console.log("📊 Data Summary:");
        console.log("   ├── 1  Admin");
        console.log("   ├── 3  Instructors  (with profiles)");
        console.log("   ├── 5  Students     (with profiles)");
        console.log("   ├── 2  Parents      (with profiles, linked to students)");
        console.log("   ├── 5  Categories");
        console.log("   ├── 5  Courses");
        console.log("   ├── 10 Lessons      (for Web Dev Bootcamp)");
        console.log("   ├── 8  Enrollments");
        console.log("   ├── 7  Lesson Progress records");
        console.log("   ├── 4  Classes");
        console.log(`   ├── ${savedSlots.length} Availability Slots`);
        console.log(`   ├── ${savedBookings.length}  Bookings`);
        console.log("   ├── 2  Booking Packages");
        console.log(`   ├── ${savedSessions.length}  Sessions`);
        console.log("   ├── 3  Recordings");
        console.log(`   ├── ${contents.length}  Content Items`);
        console.log(`   ├── ${payments.length}  Payments`);
        console.log(`   └── ${notifications.length}  Notifications`);
        console.log("\n🔑 Login Credentials (all passwords: Test@1234):");
        console.log("   ┌─────────────────────────────────────────────────┐");
        console.log("   │ Role        │ Email                             │");
        console.log("   ├─────────────┼───────────────────────────────────┤");
        console.log("   │ Admin       │ admin@lms.com                     │");
        console.log("   │ Instructor  │ john.doe@lms.com                  │");
        console.log("   │ Instructor  │ sarah.connor@lms.com              │");
        console.log("   │ Instructor  │ nihal.silva@lms.com               │");
        console.log("   │ Student     │ jane.smith@lms.com                │");
        console.log("   │ Student     │ amal.perera@lms.com               │");
        console.log("   │ Student     │ nimal.bandara@lms.com             │");
        console.log("   │ Student     │ sithara.fernando@lms.com          │");
        console.log("   │ Student     │ dilshan.jayawardena@lms.com       │");
        console.log("   │ Parent      │ kamala.perera@lms.com             │");
        console.log("   │ Parent      │ sunil.bandara@lms.com             │");
        console.log("   └─────────────┴───────────────────────────────────┘\n");

    } catch (error) {
        console.error("❌ Seeding failed:", error);
        process.exit(1);
    } finally {
        await AppDataSource.destroy();
    }
}

seedFull();
