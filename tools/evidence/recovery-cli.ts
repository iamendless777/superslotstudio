import { generateRecoveryEvidence } from "./recovery.js";

process.stdout.write(`${JSON.stringify(await generateRecoveryEvidence(), null, 2)}\n`);
