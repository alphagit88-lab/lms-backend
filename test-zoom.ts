import ZoomService from "./src/services/ZoomService";
import dotenv from "dotenv";

dotenv.config();

async function testZoom() {
    console.log("Testing Zoom API...");
    try {
        const testMeeting = await ZoomService.createMeeting({
            topic: "Test Connectivity Meeting",
            startTime: new Date(Date.now() + 10 * 60000), // 10 mins from now
            duration: 30
        });
        console.log("SUCCESS! Test Meeting Created:");
        console.log("- ID:", testMeeting.meetingId);
        console.log("- Join URL:", testMeeting.joinUrl);
        console.log("- Start URL:", testMeeting.startUrl);
    } catch (error) {
        console.error("FAILED! Zoom Connection Error:");
        console.error(error);
    }
}

testZoom();
