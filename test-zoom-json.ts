import ZoomService from "./src/services/ZoomService";
import dotenv from "dotenv";
import * as fs from "fs";

dotenv.config();

async function testZoom() {
    try {
        const testMeeting = await ZoomService.createMeeting({
            topic: "Test Connectivity Meeting",
            startTime: new Date(Date.now() + 10 * 60000), 
            duration: 30
        });
        fs.writeFileSync("zoom-result.json", JSON.stringify({ success: true, testMeeting }, null, 2));
        console.log("Success! Wrote to zoom-result.json");
    } catch (error: any) {
        fs.writeFileSync("zoom-result.json", JSON.stringify({ success: false, error: error.message, stack: error.stack }, null, 2));
        console.log("Failed! Wrote error to zoom-result.json");
    }
}

testZoom();
