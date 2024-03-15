import obfuscator from 'javascript-obfuscator';
import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const files = await readdir(path.join(process.cwd(), 'plugins'));

console.log(`Obfuscating ${files.filter((x) => x.endsWith('.js')).length} plugin${files.filter((x) => x.endsWith('.js')).length > 1 ? 's' : ''}`);

for (const file of files.filter((x) => x.endsWith('.js'))) {
	const js = await readFile(path.join(process.cwd(), 'plugins', file));

	const code = js.toString();

	if (code.startsWith(`// @obfuscator-ignore`)) {
		console.log(`- ${file} ignored`);
		continue;
	}

	const obfuscated = obfuscator.obfuscate(code, {
		target: 'node',
		compact: false,
		simplify: false,
		// selfDefending: true,
		debugProtection: true,
		renameGlobals: true,
		// renameProperties: true,
	});

	await writeFile(path.join(process.cwd(), 'plugins', file), `// @obfuscator-ignore\n\n${obfuscated.getObfuscatedCode()}`);

	console.log(`- ${file} obfuscated`);
}