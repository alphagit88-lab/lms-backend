import dotenv from "dotenv";

dotenv.config();

export interface ZoomMeetingOptions {
    topic: string;
    startTime: Date;
    duration: number; // in minutes
    agenda?: string;
}

export interface ZoomMeetingResponse {
    meetingId: string;
    joinUrl: string;
    password?: string;
    startUrl?: string;
}

export interface ZoomRecording {
    id: string;
    meetingId: string;
    downloadUrl: string;
    fileSize: number;
    fileType: string;
    playUrl: string;
    recordingStart: string;
    recordingEnd: string;
    duration: number;
}

class ZoomService {
    private clientId: string;
    private clientSecret: string;
    private accountId: string;
    private accessToken: string | null = null;
    private tokenExpiresAt: number | null = null;

    constructor() {
        this.clientId = process.env.ZOOM_CLIENT_ID || "";
        this.clientSecret = process.env.ZOOM_CLIENT_SECRET || "";
        this.accountId = process.env.ZOOM_ACCOUNT_ID || "";
    }

    /**
     * Get Access Token using Server-to-Server OAuth
     */
    private async getAccessToken(): Promise<string> {
        // Check if token is still valid
        if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
            return this.accessToken;
        }

        const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

        try {
            const response = await fetch(
                `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${this.accountId}`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Basic ${auth}`,
                    },
                }
            );

            const data = await response.json() as any;

            if (!response.ok) {
                throw new Error(`Failed to get Zoom access token: ${data.message || response.statusText}`);
            }

            this.accessToken = data.access_token;
            // Expires in data.expires_in seconds, subtract 60s for safety
            this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

            return this.accessToken!;
        } catch (error) {
            console.error("Zoom Auth Error:", error);
            throw error;
        }
    }

    /**
     * Create a Zoom Meeting (with retry on auth error)
     */
    async createMeeting(options: ZoomMeetingOptions, retryCount = 0): Promise<ZoomMeetingResponse> {
        let token = await this.getAccessToken();

        try {
            const response = await fetch("https://api.zoom.us/v2/users/me/meetings", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    topic: options.topic,
                    type: 2, // Scheduled meeting
                    start_time: options.startTime.toISOString(),
                    duration: options.duration,
                    agenda: options.agenda,
                    settings: {
                        host_video: true,
                        participant_video: true,
                        join_before_host: false,
                        mute_upon_entry: true,
                        waiting_room: true,
                        auto_recording: "cloud", // Default to cloud recording
                    },
                }),
            });

            const data = await response.json() as any;

            if (!response.ok) {
                // If token is invalid or expired (401) or insufficient scope (4700/403), try refreshing once
                if ((response.status === 401 || (data.code === 4700) || (data.code === 124)) && retryCount < 1) {
                    console.log("Zoom Auth Error (Status:", response.status, "Code:", data.code, ") - Retrying with fresh token...");
                    this.accessToken = null; // Clear cached token
                    this.tokenExpiresAt = null;
                    return this.createMeeting(options, retryCount + 1);
                }

                console.error("Zoom Create Meeting Failed:", {
                    status: response.status,
                    statusText: response.statusText,
                    data
                });
                throw new Error(`Failed to create Zoom meeting: ${data.message || response.statusText}`);
            }

            return {
                meetingId: data.id.toString(),
                joinUrl: data.join_url,
                password: data.password,
                startUrl: data.start_url,
            };
        } catch (error) {
            console.error("Zoom Create Meeting Error:", error);
            throw error;
        }
    }

    /**
     * Get Meeting Details
     */
    async getMeeting(meetingId: string): Promise<any> {
        const token = await this.getAccessToken();

        try {
            const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await response.json() as any;

            if (!response.ok) {
                throw new Error(`Failed to get Zoom meeting: ${data.message || response.statusText}`);
            }

            return data;
        } catch (error) {
            console.error("Zoom Get Meeting Error:", error);
            throw error;
        }
    }

    /**
     * Delete a Zoom Meeting
     */
    async deleteMeeting(meetingId: string): Promise<void> {
        const token = await this.getAccessToken();

        try {
            const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                const data = await response.json() as any;
                throw new Error(`Failed to delete Zoom meeting: ${data.message || response.statusText}`);
            }
        } catch (error) {
            console.error("Zoom Delete Meeting Error:", error);
            throw error;
        }
    }

    /**
     * Get Meeting Recordings
     */
    async getMeetingRecordings(meetingId: string): Promise<ZoomRecording[]> {
        const token = await this.getAccessToken();

        try {
            const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}/recordings`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await response.json() as any;

            if (!response.ok) {
                // If recordings are not found yet, it might return 404
                if (response.status === 404) return [];
                throw new Error(`Failed to get Zoom recordings: ${data.message || response.statusText}`);
            }

            return data.recording_files.map((file: any) => ({
                id: file.id,
                meetingId: data.id.toString(),
                downloadUrl: file.download_url,
                fileSize: file.file_size,
                fileType: file.file_type,
                playUrl: file.play_url,
                recordingStart: file.recording_start,
                recordingEnd: file.recording_end,
                duration: Math.round((new Date(file.recording_end).getTime() - new Date(file.recording_start).getTime()) / 60000),
            }));
        } catch (error) {
            console.error("Zoom Get Recordings Error:", error);
            throw error;
        }
    }
}

export default new ZoomService();
