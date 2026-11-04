/**
 * Admin commands, run inside the API container:
 *   docker exec -it pod-api node dist/cli.js create-admin you@example.com "Full Name"
 * The password is asked interactively (never on the command line). An existing user is promoted.
 */
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { createInterface } from "node:readline";
import { removeDemo, seedDemo } from "./demo/seed";
import { StorageService } from "./modules/files/storage.service";

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  out._writeToOutput = (s: string) => {
    if (s.includes(question)) out.output.write(s);
    else out.output.write("*");
  };
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    }),
  );
}

async function createAdmin(email: string, name: string): Promise<void> {
  const prisma = new PrismaClient();
  try {
    email = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
      console.log(`${email} is now an admin.`);
    } else {
      const password = await ask("Password (min 10 chars): ");
      if (password.length < 10 || password !== (await ask("Repeat: "))) {
        throw new Error("Passwords must match and be at least 10 characters.");
      }
      const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
      const user = await prisma.user.create({ data: { email, name, passwordHash, role: "ADMIN", emailVerifiedAt: new Date() } });
      console.log(`Created admin ${user.email}.`);
    }
    await prisma.auditLog.create({ data: { action: "user.admin_granted", target: email, detail: { via: "cli" } } });
  } finally {
    await prisma.$disconnect();
  }
}

async function demo(action: "seed" | "remove"): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const storage = new StorageService({ env: process.env.NODE_ENV ?? "development", port: 0, databaseUrl: "", redisUrl: "", publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "" });
    console.log(action === "seed" ? await seedDemo(prisma, storage) : await removeDemo(prisma, storage));
  } finally {
    await prisma.$disconnect();
  }
}

async function main(argv: string[]): Promise<void> {
  if (argv[0] === "create-admin" && argv[1]) return createAdmin(argv[1], argv[2] ?? argv[1].split("@")[0]);
  if (argv[0] === "seed-demo") return demo("seed");
  if (argv[0] === "remove-demo") return demo("remove");
  console.log("Usage: node dist/cli.js create-admin EMAIL [NAME] | seed-demo | remove-demo");
  process.exitCode = 1;
}

main(process.argv.slice(2)).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
