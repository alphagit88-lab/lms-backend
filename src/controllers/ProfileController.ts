import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { StudentProfile } from "../entities/StudentProfile";
import { TeacherProfile } from "../entities/TeacherProfile";
import { ParentProfile } from "../entities/ParentProfile";
import { User } from "../entities/User";

export class ProfileController {
  // Create/Update Student Profile
  static updateStudentProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;
      const { grade, medium, school, dateOfBirth, interests, learningStyle, notes } = req.body;

      const profileRepository = AppDataSource.getRepository(StudentProfile);
      let profile = await profileRepository.findOne({ where: { studentId: userId } });

      if (profile) {
        // Update existing profile
        if (grade) profile.grade = grade;
        if (medium) profile.medium = medium;
        if (school !== undefined) profile.school = school;
        if (dateOfBirth) profile.dateOfBirth = new Date(dateOfBirth);
        if (interests !== undefined) profile.interests = interests;
        if (learningStyle !== undefined) profile.learningStyle = learningStyle;
        if (notes !== undefined) profile.notes = notes;
      } else {
        // Create new profile
        if (!grade || !medium) {
          return res.status(400).json({ error: "Grade and medium are required" });
        }

        profile = profileRepository.create({
          studentId: userId,
          grade,
          medium,
          school,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          interests,
          learningStyle,
          notes,
        });
      }

      await profileRepository.save(profile);

      return res.json({ message: "Student profile updated successfully", profile });
    } catch (error: any) {
      console.error("Error updating student profile:", error);
      return res.status(500).json({ error: "Failed to update student profile" });
    }
  };

  // Get Student Profile
  static getStudentProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const studentId = req.params.studentId as string;
      const userId = req.session.userId!;
      const userRole = req.session.userRole;

      // Allow user to view their own profile, or parents/teachers to view student profiles
      if (studentId !== userId && userRole !== "parent" && userRole !== "instructor" && userRole !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }

      const profileRepository = AppDataSource.getRepository(StudentProfile);
      const profile = await profileRepository.findOne({
        where: { studentId },
        relations: ["student"],
      });

      if (!profile) {
        return res.status(404).json({ error: "Student profile not found" });
      }

      return res.json({ profile });
    } catch (error: any) {
      console.error("Error fetching student profile:", error);
      return res.status(500).json({ error: "Failed to fetch student profile" });
    }
  };

  // Create/Update Teacher Profile
  static updateTeacherProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;
      const {
        specialization,
        qualifications,
        yearsExperience,
        hourlyRate,
        teachingLanguages,
        subjects,
        availabilityTimezone,
        autoConfirmBookings,
        packageDiscount3Plus,
        packageDiscount5Plus,
      } = req.body;

      const profileRepository = AppDataSource.getRepository(TeacherProfile);
      let profile = await profileRepository.findOne({ where: { teacherId: userId } });

      if (profile) {
        // Update existing profile
        if (specialization !== undefined) profile.specialization = specialization;
        if (qualifications !== undefined) profile.qualifications = qualifications;
        if (yearsExperience !== undefined) profile.yearsExperience = yearsExperience;
        if (hourlyRate !== undefined) profile.hourlyRate = hourlyRate;
        if (teachingLanguages !== undefined) profile.teachingLanguages = teachingLanguages;
        if (subjects !== undefined) profile.subjects = subjects;
        if (availabilityTimezone !== undefined) profile.availabilityTimezone = availabilityTimezone;
        if (autoConfirmBookings !== undefined) profile.autoConfirmBookings = autoConfirmBookings;
        if (packageDiscount3Plus !== undefined) profile.packageDiscount3Plus = packageDiscount3Plus;
        if (packageDiscount5Plus !== undefined) profile.packageDiscount5Plus = packageDiscount5Plus;
      } else {
        // Create new profile
        profile = profileRepository.create({
          teacherId: userId,
          specialization,
          qualifications,
          yearsExperience,
          hourlyRate,
          teachingLanguages,
          subjects,
          availabilityTimezone,
          autoConfirmBookings: autoConfirmBookings ?? false,
          packageDiscount3Plus: packageDiscount3Plus ?? 5.00,
          packageDiscount5Plus: packageDiscount5Plus ?? 10.00,
        });
      }

      await profileRepository.save(profile);

      return res.json({ message: "Teacher profile updated successfully", profile });
    } catch (error: any) {
      console.error("Error updating teacher profile:", error);
      return res.status(500).json({ error: "Failed to update teacher profile" });
    }
  };

  // Get Teacher Profile (Public)
  // Get own teacher profile using session (authenticated instructor)
  static getMyTeacherProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const teacherId = req.session.userId!;

      const profileRepository = AppDataSource.getRepository(TeacherProfile);
      const profile = await profileRepository.findOne({
        where: { teacherId },
        relations: ["teacher"],
      });

      if (!profile) {
        return res.status(404).json({ error: "Teacher profile not found" });
      }

      return res.json({ profile });
    } catch (error: any) {
      console.error("Error fetching own teacher profile:", error);
      return res.status(500).json({ error: "Failed to fetch teacher profile" });
    }
  };

  static getTeacherProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const teacherId = req.params.teacherId as string;

      const profileRepository = AppDataSource.getRepository(TeacherProfile);
      const profile = await profileRepository.findOne({
        where: { teacherId },
        relations: ["teacher"],
      });

      if (!profile) {
        return res.status(404).json({ error: "Teacher profile not found" });
      }

      return res.json({ profile });
    } catch (error: any) {
      console.error("Error fetching teacher profile:", error);
      return res.status(500).json({ error: "Failed to fetch teacher profile" });
    }
  };

  // Create/Update Parent Profile
  static updateParentProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;
      const { relationship, occupation, emergencyContact, preferredLanguage, notes } = req.body;

      const profileRepository = AppDataSource.getRepository(ParentProfile);
      let profile = await profileRepository.findOne({ where: { parentId: userId } });

      if (profile) {
        // Update existing profile
        if (relationship) profile.relationship = relationship;
        if (occupation !== undefined) profile.occupation = occupation;
        if (emergencyContact !== undefined) profile.emergencyContact = emergencyContact;
        if (preferredLanguage !== undefined) profile.preferredLanguage = preferredLanguage;
        if (notes !== undefined) profile.notes = notes;
      } else {
        // Create new profile
        profile = profileRepository.create({
          parentId: userId,
          relationship,
          occupation,
          emergencyContact,
          preferredLanguage,
          notes,
        });
      }

      await profileRepository.save(profile);

      return res.json({ message: "Parent profile updated successfully", profile });
    } catch (error: any) {
      console.error("Error updating parent profile:", error);
      return res.status(500).json({ error: "Failed to update parent profile" });
    }
  };

  // Get Parent Profile
  static getParentProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.session.userId!;

      const profileRepository = AppDataSource.getRepository(ParentProfile);
      const profile = await profileRepository.findOne({
        where: { parentId: userId },
        relations: ["parent"],
      });

      if (!profile) {
        return res.status(404).json({ error: "Parent profile not found" });
      }

      return res.json({ profile });
    } catch (error: any) {
      console.error("Error fetching parent profile:", error);
      return res.status(500).json({ error: "Failed to fetch parent profile" });
    }
  };

  // Get all verified teachers (Public)
  static getVerifiedTeachers = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { subject, language, minRating } = req.query;

      const profileRepository = AppDataSource.getRepository(TeacherProfile);
      let query = profileRepository.createQueryBuilder("profile")
        .leftJoinAndSelect("profile.teacher", "teacher")
        .where("profile.verified = :verified", { verified: true });

      if (subject) {
        query = query.andWhere("profile.subjects LIKE :subject", { subject: `%${subject}%` });
      }

      if (language) {
        query = query.andWhere("profile.teaching_languages LIKE :language", { language: `%${language}%` });
      }

      if (minRating) {
        query = query.andWhere("profile.rating >= :minRating", { minRating });
      }

      const teachers = await query.orderBy("profile.rating", "DESC").getMany();

      return res.json({ teachers });
    } catch (error: any) {
      console.error("Error fetching verified teachers:", error);
      return res.status(500).json({ error: "Failed to fetch verified teachers" });
    }
  };

  // Verify teacher (Admin only)
  static verifyTeacher = async (req: Request, res: Response): Promise<Response> => {
    try {
      const teacherId = req.params.teacherId as string;
      const adminId = req.session.userId!;

      const profileRepository = AppDataSource.getRepository(TeacherProfile);
      const profile = await profileRepository.findOne({ where: { teacherId } });

      if (!profile) {
        return res.status(404).json({ error: "Teacher profile not found" });
      }

      profile.verified = true;
      profile.verifiedAt = new Date();
      profile.verifiedBy = adminId;

      await profileRepository.save(profile);

      return res.json({ message: "Teacher verified successfully", profile });
    } catch (error: any) {
      console.error("Error verifying teacher:", error);
      return res.status(500).json({ error: "Failed to verify teacher" });
    }
  };

  /**
   * Get similar teachers (same subject, excluding the given teacher)
   * GET /api/profiles/teacher/:teacherId/similar?limit=5
   */
  static getSimilarTeachers = async (req: Request, res: Response): Promise<Response> => {
    try {
      const teacherId = req.params.teacherId as string;
      const limit = Math.min(parseInt((req.query.limit as string) ?? "5", 10), 20);

      const profileRepository = AppDataSource.getRepository(TeacherProfile);

      // Load source teacher to get their subjects
      const sourceProfile = await profileRepository.findOne({ where: { teacherId } });
      if (!sourceProfile || !sourceProfile.subjects) {
        return res.json({ teachers: [] });
      }

      // Parse subjects — handle comma-separated string or JSON array
      let subjectList: string[] = [];
      try {
        const parsed = JSON.parse(sourceProfile.subjects);
        subjectList = Array.isArray(parsed) ? parsed : [sourceProfile.subjects];
      } catch {
        subjectList = sourceProfile.subjects.split(",").map((s) => s.trim()).filter(Boolean);
      }

      if (subjectList.length === 0) {
        return res.json({ teachers: [] });
      }

      // Build query: find other verified teachers whose subjects overlap
      let query = profileRepository
        .createQueryBuilder("profile")
        .leftJoinAndSelect("profile.teacher", "teacher")
        .where("profile.teacherId != :teacherId", { teacherId })
        .andWhere("profile.subjects IS NOT NULL");

      // OR condition for any matching subject keyword
      const subjectConditions = subjectList.map((_, idx) => `profile.subjects LIKE :subject${idx}`);
      const subjectParams: Record<string, string> = {};
      subjectList.forEach((s, idx) => { subjectParams[`subject${idx}`] = `%${s}%`; });

      query = query.andWhere(`(${subjectConditions.join(" OR ")})`, subjectParams);

      const teachers = await query
        .orderBy("profile.rating", "DESC")
        .addOrderBy("profile.totalStudents", "DESC")
        .limit(limit)
        .getMany();

      return res.json({ teachers });
    } catch (error: any) {
      console.error("Error fetching similar teachers:", error);
      return res.status(500).json({ error: "Failed to fetch similar teachers" });
    }
  };
}
