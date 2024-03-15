import { symlinkSync } from "fs";
import { join } from "path";

try {
	symlinkSync(join(process.cwd(), 'dist'), join(process.cwd(), 'plugins', 'dist'));
} catch (err) { }