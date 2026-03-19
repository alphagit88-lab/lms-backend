import { AppDataSource } from "./src/config/data-source";
import { User } from "./src/entities/User";

async function check() {
    await AppDataSource.initialize();
    const userRepo = AppDataSource.getRepository(User);
    const users = await userRepo.find({ where: { role: 'instructor' }, select: ["email", "firstName", "lastName"] });
    console.log(users);
    process.exit(0);
}

check();
