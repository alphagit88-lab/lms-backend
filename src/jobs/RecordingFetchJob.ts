import { AppDataSource } from "../config/data-source";
import { Session, SessionStatus } from "../entities/Session";
import { Recording } from "../entities/Recording";
import ZoomService from "../services/ZoomService";
import { Logger } from "../utils/logger";
import { LessThan } from "typeorm";

export class RecordingFetchJob {
    /**
     * Run the job to fetch recordings for completed sessions
     */
    static async run(): Promise<void> {
        try {
            const sessionRepo = AppDataSource.getRepository(Session);
            const recordingRepo = AppDataSource.getRepository(Recording);

            // Find completed sessions without recordings that ended at least 15 mins ago
            // (Zoom takes some time to process recordings)
            const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

            const sessions = await sessionRepo.find({
                where: {
                    status: SessionStatus.COMPLETED,
                    isRecorded: false,
                    endTime: LessThan(fifteenMinsAgo),
                },
            });

            if (sessions.length === 0) return;

            Logger.info(`RecordingFetchJob: Checking recordings for ${sessions.length} sessions`);

            for (const session of sessions) {
                if (!session.meetingId) continue;

                try {
                    const zoomRecordings = await ZoomService.getMeetingRecordings(session.meetingId);

                    if (zoomRecordings.length > 0) {
                        // Usually we take the first video file
                        const videoFile = zoomRecordings.find(f => f.fileType === 'MP4') || zoomRecordings[0];

                        const recording = recordingRepo.create({
                            sessionId: session.id,
                            fileUrl: videoFile.playUrl,
                            fileSize: videoFile.fileSize,
                            durationMinutes: videoFile.duration,
                            videoQuality: videoFile.fileType,
                            isProcessed: true,
                            isPublic: false,
                            uploadedAt: new Date(),
                            metadata: {
                                zoomFileId: videoFile.id,
                                downloadUrl: videoFile.downloadUrl
                            }
                        });

                        await recordingRepo.save(recording);

                        // Mark session as recorded
                        session.isRecorded = true;
                        await sessionRepo.save(session);

                        Logger.info(`Successfully fetched recording for session ${session.id}`);
                    }
                } catch (error) {
                    Logger.error(`Failed to fetch recording for session ${session.id}`, error);
                }
            }
        } catch (error) {
            Logger.error("RecordingFetchJob Error:", error);
        }
    }

    /**
     * Start the job scheduler
     */
    static start(intervalMs: number = 30 * 60 * 1000): void {
        Logger.info(`Starting RecordingFetchJob scheduler (every ${intervalMs / 60000} mins)`);
        // Run once at start
        this.run();
        // Then schedule
        setInterval(() => this.run(), intervalMs);
    }
}
