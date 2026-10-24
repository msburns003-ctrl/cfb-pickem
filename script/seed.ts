import "dotenv/config";
import { storage } from "../server/storage";
import { hashPassword, generateTempPassword } from "../server/auth";

async function main() {
  const email = "msburns003@gmail.com";
  const existing = await storage.getUserByEmail(email);
  if (existing) {
    console.log(`Admin account already exists for ${email}`);
    return;
  }
  // Generate a random one-time password at run time -- never hard-code one here.
  const tempPassword = generateTempPassword();
  await storage.createUser({
    name: "Matthew Burns",
    email,
    passwordHash: hashPassword(tempPassword),
    isAdmin: true,
  });
  console.log(`Created admin account:\n  email: ${email}\n  temp password: ${tempPassword}`);
}

main();
