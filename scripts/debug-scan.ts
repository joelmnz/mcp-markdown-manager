
import { readdir, writeFile, mkdir, rm } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';

async function main() {
    const TEST_DIR = join(process.cwd(), 'temp_debug_scan');
    console.log('Testing directory:', TEST_DIR);

    try {
        if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true, force: true });
        await mkdir(TEST_DIR, { recursive: true });

        const filename = 'test-file.md';
        const filepath = join(TEST_DIR, filename);
        await writeFile(filepath, 'content');
        console.log('Created file:', filepath);

        const entries = await readdir(TEST_DIR, { withFileTypes: true });
        console.log('Entries found:', entries.length);

        for (const entry of entries) {
            console.log({
                name: entry.name,
                isFile: entry.isFile(),
                isDirectory: entry.isDirectory(),
                ext: extname(entry.name)
            });

            if (entry.isFile() && extname(entry.name) === '.md') {
                console.log('MATCH FOUND!');
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true, force: true });
    }
}

main();
