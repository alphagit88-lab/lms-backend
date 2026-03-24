import "reflect-metadata";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";

async function fixPendingEmails() {
    try {
        await AppDataSource.initialize();
        console.log("Database connected.");

        const userRepository = AppDataSource.getRepository(User);
        
        // Find all users with emailVerified = false
        const users = await userRepository.find({ where: { emailVerified: false } });
        console.log(`Found ${users.length} users with pending email verification.`);

        for (const user of users) {
             user.emailVerified = true;
             await userRepository.save(user);
             console.log(`Updated user: ${user.email}`);
        }

        console.log("All pending emails have been verified.");
        process.exit(0);
    } catch (error) {
        console.error("Error updating users:", error);
        process.exit(1);
    }
}

fixPendingEmails();