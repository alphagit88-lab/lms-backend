import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Session, SessionStatus, SessionType } from "../entities/Session";
import { Booking, BookingStatus } from "../entities/Booking";
import { Class } from "../entities/Class";
import { Course } from "../entities/Course";
import { Enrollment } from "../entities/Enrollment";
import { User } from "../entities/User";
import { parsePagination, createPaginationMeta } from "../utils/pagination";
import ZoomService from "../services/ZoomService";
import { Logger } from "../utils/logger";
import { isZoomFreePlan, ZOOM_MAX_FREE_DURATION_MINUTES } from "../config/zoomConfig";

export class SessionController {
    /**
     * Get upcoming sessions for the current user (convenience wrapper)
     */
    static getUpcomingSessions = async (req: Request, res: Response): Promise<Response> => {
        req.query.type = "upcoming";
        return SessionController.getSessions(req, res);
    };
    
    /**
     * Get sessions for the current user (with filters)
     */
    static getSessions = async (req: Request, res: Response): Promise<Response> => {
        try {
            const userId = req.session.userId!;
            const userRole = req.session.userRole;
            const { type, status, limit } = req.query;

            const sessionRepo = AppDataSource.getRepository(Session);
            const query = sessionRepo.createQueryBuilder("session")
                .leftJoinAndSelect("session.class", "class")
                .leftJoinAndSelect("session.booking", "booking");

            // Type filter: upcoming or past
            if (type === "upcoming") {
                query.andWhere("session.startTime > :now", { now: new Date() });
            } else if (type === "past") {
                query.andWhere("session.startTime <= :now", { now: new Date() });
            }

            // Status filter
            if (status) {
                query.andWhere("session.status = :status", { status });
            } else {
                query.andWhere("session.status != :cancelled", { cancelled: SessionStatus.CANCELLED });
            }

            if (userRole === "instructor") {
                query.andWhere(
                    "(class.teacherId = :userId OR booking.teacherId = :userId OR session.teacherId = :userId)",
                    { userId }
                );
            } else if (userRole === "student") {
                const enrollmentRepo = AppDataSource.getRepository(Enrollment);
                const enrollments = await enrollmentRepo.find({
                    where: { studentId: userId, status: "active" },
                    select: ["courseId"],
                });
                const enrolledCourseIds = enrollments.map(e => e.courseId);

                if (enrolledCourseIds.length > 0) {
                    const courses = await AppDataSource.getRepository(Course).find({
                        where: enrolledCourseIds.map(id => ({ id })),
                        select: ["instructorId"],
                    });
                    const instructorIds = [...new Set(courses.map(c => c.instructorId))];

                    if (instructorIds.length > 0) {
                        query.andWhere(
                            "(booking.studentId = :userId OR class.courseId IN (:...courseIds) OR session.teacherId IN (:...instructorIds))",
                            { userId, courseIds: enrolledCourseIds, instructorIds }
                        );
                    } else {
                        query.andWhere(
                            "(booking.studentId = :userId OR class.courseId IN (:...courseIds))",
                            { userId, courseIds: enrolledCourseIds }
                        );
                    }
                } else {
                    query.andWhere("booking.studentId = :userId", { userId });
                }
            }

            if (limit) {
                query.limit(Number(limit));
            }

            const sessions = await query
                .orderBy("session.startTime", type === "upcoming" ? "ASC" : "DESC")
                .getMany();

            return res.json({ sessions });
        } catch (error) {
            Logger.error("Error fetching sessions:", error);
            return res.status(500).json({ error: "Failed to fetch sessions" });
        }
    };

    /**
     * Get session details
     */
    static getSessionById = async (req: Request, res: Response): Promise<Response> => {
        try {
            const id = req.params.id as string;
            const userId = req.session.userId!;
            const userRole = req.session.userRole;

            const sessionRepo = AppDataSource.getRepository(Session);
            const session = await sessionRepo.findOne({
                where: { id },
                relations: ["class", "booking", "class.teacher", "booking.teacher", "booking.student"],
            });

            if (!session) {
                return res.status(404).json({ error: "Session not found" });
            }

            // Access Control Check
            let hasAccess = false;
            if (userRole === "admin") {
                hasAccess = true;
            } else if (userRole === "instructor") {
                hasAccess = session.class?.teacherId === userId || session.booking?.teacherId === userId || session.teacherId === userId;
            } else if (userRole === "student") {
                if (session.booking?.studentId === userId) {
                    hasAccess = true;
                } else if (session.class) {
                    const enrollment = await AppDataSource.getRepository(Enrollment).findOne({
                        where: { studentId: userId, courseId: session.class.courseId, status: "active" },
                    });
                    if (enrollment) hasAccess = true;
                }
            }

            if (!hasAccess) {
                return res.status(403).json({ error: "You do not have access to this session" });
            }

            return res.json({ session });
        } catch (error) {
            Logger.error("Error fetching session details:", error);
            return res.status(500).json({ error: "Failed to fetch session details" });
        }
    };

    /**
     * Start a session (Teacher only)
     */
    static startSession = async (req: Request, res: Response): Promise<Response> => {
        try {
            const id = req.params.id as string;
            const teacherId = req.session.userId!;

            const sessionRepo = AppDataSource.getRepository(Session);
            const session = await sessionRepo.findOne({
                where: { id },
                relations: ["class", "booking"],
            });

            if (!session) {
                return res.status(404).json({ error: "Session not found" });
            }

            // Verify teacher ownership
            const isOwner = session.class?.teacherId === teacherId || session.booking?.teacherId === teacherId || session.teacherId === teacherId;
            if (!isOwner) {
                return res.status(403).json({ error: "Only the instructor can start this session" });
            }

            session.status = SessionStatus.IN_PROGRESS;
            await sessionRepo.save(session);

            return res.json({ message: "Session started", session });
        } catch (error) {
            Logger.error("Error starting session:", error);
            return res.status(500).json({ error: "Failed to start session" });
        }
    };

    /**
     * Create an ad-hoc session (Teacher only)
     * POST /api/sessions
     * Body: { classId?, title, description?, startTime, endTime, sessionType?, createZoomMeeting? }
     */
    static createSession = async (req: Request, res: Response): Promise<Response> => {
        try {
            const teacherId = req.session.userId!;
            const {
                classId,
                bookingId,
                title,
                description,
                startTime,
                endTime,
                sessionType,
                createZoomMeeting: shouldCreateZoom,
            } = req.body;

            if (!title || !startTime || !endTime) {
                return res.status(400).json({ error: "title, startTime and endTime are required" });
            }

            const start = new Date(startTime);
            const end = new Date(endTime);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return res.status(400).json({ error: "Invalid startTime or endTime" });
            }
            if (end <= start) {
                return res.status(400).json({ error: "endTime must be after startTime" });
            }

            const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
            if (shouldCreateZoom && isZoomFreePlan() && durationMinutes > ZOOM_MAX_FREE_DURATION_MINUTES) {
                return res.status(400).json({
                    error: `For Zoom free accounts, sessions with an auto-created Zoom meeting must be ${ZOOM_MAX_FREE_DURATION_MINUTES} minutes or less. Current duration: ${durationMinutes} minutes.`,
                });
            }

            // If classId supplied, verify the teacher owns it
            if (classId) {
                const classEntry = await AppDataSource.getRepository(Class).findOne({ where: { id: classId } });
                if (!classEntry) return res.status(404).json({ error: "Class not found" });
                if (classEntry.teacherId !== teacherId) {
                    return res.status(403).json({ error: "You do not own this class" });
                }
            }

            const sessionRepo = AppDataSource.getRepository(Session);

            let meetingLink: string | undefined;
            let meetingId: string | undefined;
            let meetingPassword: string | undefined;

            // Optionally auto-create a Zoom meeting
            if (shouldCreateZoom) {
                try {
                    const duration = Math.round((end.getTime() - start.getTime()) / 60000);
                    const zoomResp = await ZoomService.createMeeting({ topic: title, startTime: start, duration });
                    meetingLink = zoomResp.joinUrl;
                    meetingId = zoomResp.meetingId;
                    meetingPassword = zoomResp.password;
                } catch (zoomError) {
                    Logger.error("Zoom meeting creation failed for ad-hoc session:", zoomError);
                    
                    // Return error to client so they know the Zoom link failed
                    return res.status(500).json({ 
                        error: "Failed to create Zoom meeting. Please check your Zoom integration or uncheck 'Auto-create Zoom meeting link'." 
                    });
                }
            }

            const session = sessionRepo.create({
                teacherId, // Explicitly track the creator for ad-hoc sessions
                classId: classId || undefined,
                bookingId: bookingId || undefined,
                title,
                description: description || undefined,
                startTime: start,
                endTime: end,
                sessionType: sessionType || SessionType.LIVE,
                status: SessionStatus.SCHEDULED,
                meetingLink,
                meetingId,
                meetingPassword,
            });

            await sessionRepo.save(session);

            Logger.info(`Created ad-hoc session ${session.id} for teacher ${teacherId}`);
            return res.status(201).json({ message: "Session created", session });
        } catch (error) {
            Logger.error("Error creating session:", error);
            return res.status(500).json({ error: "Failed to create session" });
        }
    };

    /**
     * Cancel a session (Teacher only)
     * DELETE /api/sessions/:id
     */
    static cancelSession = async (req: Request, res: Response): Promise<Response> => {
        try {
            const id = req.params.id as string;
            const teacherId = req.session.userId!;

            const sessionRepo = AppDataSource.getRepository(Session);
            const session = await sessionRepo.findOne({
                where: { id },
                relations: ["class", "booking"],
            });

            if (!session) return res.status(404).json({ error: "Session not found" });

            if (session.status === SessionStatus.CANCELLED) {
                return res.status(400).json({ error: "Session is already cancelled" });
            }
            if (session.status === SessionStatus.COMPLETED) {
                return res.status(400).json({ error: "Cannot cancel a completed session" });
            }

            const isOwner = session.class?.teacherId === teacherId || session.booking?.teacherId === teacherId || session.teacherId === teacherId;
            if (!isOwner) {
                return res.status(403).json({ error: "Only the instructor can cancel this session" });
            }

            // Best-effort: delete Zoom meeting if one exists
            if (session.meetingId) {
                try {
                    await ZoomService.deleteMeeting(session.meetingId);
                } catch (zoomError) {
                    Logger.error(`Zoom meeting deletion failed for session ${id}:`, zoomError);
                }
            }

            session.status = SessionStatus.CANCELLED;
            await sessionRepo.save(session);

            Logger.info(`Cancelled session ${id} by teacher ${teacherId}`);
            return res.json({ message: "Session cancelled", session });
        } catch (error) {
            Logger.error("Error cancelling session:", error);
            return res.status(500).json({ error: "Failed to cancel session" });
        }
    };

    /**
     * End a session (Teacher only)
     */
    static endSession = async (req: Request, res: Response): Promise<Response> => {
        try {
            const id = req.params.id as string;
            const teacherId = req.session.userId!;

            const sessionRepo = AppDataSource.getRepository(Session);
            const session = await sessionRepo.findOne({
                where: { id },
                relations: ["class", "booking"],
            });

            if (!session) {
                return res.status(404).json({ error: "Session not found" });
            }

            // Verify teacher ownership
            const isOwner = session.class?.teacherId === teacherId || session.booking?.teacherId === teacherId || session.teacherId === teacherId;
            if (!isOwner) {
                return res.status(403).json({ error: "Only the instructor can end this session" });
            }

            session.status = SessionStatus.COMPLETED;
            session.endTime = new Date(); // Update actual end time
            await sessionRepo.save(session);

            // If it's a booking, mark it as completed too
            if (session.bookingId) {
                const bookingRepo = AppDataSource.getRepository(Booking);
                await bookingRepo.update(session.bookingId, { status: BookingStatus.COMPLETED });
            }

            return res.json({ message: "Session ended", session });
        } catch (error) {
            Logger.error("Error ending session:", error);
            return res.status(500).json({ error: "Failed to end session" });
        }
    };
}
