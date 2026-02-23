import "reflect-metadata";
import { AppDataSource } from "../config/data-source";
import { Session, SessionType, SessionStatus } from "../entities/Session";
import { Class } from "../entities/Class";
import { User } from "../entities/User";

async function seedSessions() {
  try {
    await AppDataSource.initialize();
    console.log("✓ Database connected");

    const sessionRepository = AppDataSource.getRepository(Session);
    const classRepository = AppDataSource.getRepository(Class);
    const userRepository = AppDataSource.getRepository(User);

    // Find an instructor
    const instructor = await userRepository.findOne({
      where: { role: "instructor" },
    });

    if (!instructor) {
      console.error("❌ No instructor found! Please create an instructor user first.");
      process.exit(1);
    }

    console.log(`✓ Found instructor: ${instructor.email}`);

    // Find or create a class
    let classEntity = await classRepository.findOne({
      where: { teacherId: instructor.id },
    });

    if (!classEntity) {
      // Create a test class
      classEntity = classRepository.create({
        teacherId: instructor.id,
        subject: "Mathematics",
        grade: "Grade 10",
        medium: "English",
        description: "Advanced Mathematics class for Grade 10 students",
        price: 1500,
        isActive: true,
        isGroup: false,
      });
      await classRepository.save(classEntity);
      console.log("✓ Created test class");
    } else {
      console.log(`✓ Found existing class: ${classEntity.subject}`);
    }

    // Create test sessions
    const now = new Date();
    const sessions = [
      {
        classId: classEntity.id,
        title: "Introduction to Algebra - Recorded Session",
        description: "Fundamental concepts of algebra with examples",
        startTime: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        endTime: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // 1 hour
        sessionType: SessionType.RECORDED,
        status: SessionStatus.COMPLETED,
        isRecorded: true,
        attendanceCount: 15,
      },
      {
        classId: classEntity.id,
        title: "Quadratic Equations - Live Class Recording",
        description: "Solving quadratic equations step by step",
        startTime: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        endTime: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000), // 1.5 hours
        sessionType: SessionType.LIVE,
        status: SessionStatus.COMPLETED,
        isRecorded: true,
        attendanceCount: 22,
      },
      {
        classId: classEntity.id,
        title: "Trigonometry Basics - Recorded Lecture",
        description: "Introduction to sine, cosine, and tangent",
        startTime: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        endTime: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000), // 45 minutes
        sessionType: SessionType.RECORDED,
        status: SessionStatus.COMPLETED,
        isRecorded: true,
        attendanceCount: 18,
      },
      {
        classId: classEntity.id,
        title: "Geometry - Upcoming Session",
        description: "Areas and volumes of geometric shapes",
        startTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        endTime: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // 1 hour
        sessionType: SessionType.LIVE,
        status: SessionStatus.SCHEDULED,
        isRecorded: false,
        attendanceCount: 0,
      },
      {
        classId: classEntity.id,
        title: "Calculus Introduction - Past Session",
        description: "Limits and derivatives introduction",
        startTime: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        endTime: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000 + 75 * 60 * 1000), // 1.25 hours
        sessionType: SessionType.HYBRID,
        status: SessionStatus.COMPLETED,
        isRecorded: true,
        attendanceCount: 25,
      },
    ];

    let createdCount = 0;
    for (const sessionData of sessions) {
      const existingSession = await sessionRepository.findOne({
        where: { title: sessionData.title },
      });

      if (!existingSession) {
        const session = sessionRepository.create(sessionData);
        await sessionRepository.save(session);
        console.log(`✓ Created session: ${session.title} (ID: ${session.id})`);
        createdCount++;
      } else {
        console.log(`⊙ Session already exists: ${sessionData.title} (ID: ${existingSession.id})`);
      }
    }

    console.log(`\n🎉 Seed complete! Created ${createdCount} new session(s)`);
    console.log("\n📋 To add recordings, use any of the session IDs printed above.");
    console.log("   Navigate to: http://localhost:3000/instructor/recordings");

    await AppDataSource.destroy();
  } catch (error) {
    console.error("❌ Seed error:", error);
    process.exit(1);
  }
}

seedSessions();
