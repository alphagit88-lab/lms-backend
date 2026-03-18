import dotenv from "dotenv";
import { Buffer } from "buffer";

dotenv.config();

async function testToken() {
    const clientId = process.env.ZOOM_CLIENT_ID || "";
    const clientSecret = process.env.ZOOM_CLIENT_SECRET || "";
    const accountId = process.env.ZOOM_ACCOUNT_ID || "";

    console.log("Testing Zoom Token...");
    console.log("Client ID:", clientId.substring(0, 5) + "...");
    
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    
    try {
        const response = await fetch(
            `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Basic ${auth}`,
                },
            }
        );

        const data = await response.json() as any;
        console.log("Response Status:", response.status);
        console.log("Response Data:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Token Error:", error);
    }
}

testToken();
