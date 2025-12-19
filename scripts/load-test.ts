
import { databaseInit } from '../src/backend/services/databaseInit.js';
import { database } from '../src/backend/services/database.js';
import { databaseArticleService } from '../src/backend/services/databaseArticles.js';

// Configuration
const CONCURRENT_CLIENTS = 20;
const OPERATIONS_PER_CLIENT = 50;
const DURATION_MS = 10000;

async function runLoadTest() {
    console.log('🚀 Starting Performance Load Test');
    console.log(`Clients: ${CONCURRENT_CLIENTS}, Ops/Client: ${OPERATIONS_PER_CLIENT}`);

    // Hardcode env vars for test
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'article_manager';
    process.env.DB_USER = 'article_user';
    process.env.DB_PASSWORD = 'secure_password';

    try {
        await databaseInit.initialize();

        // Setup test data
        try {
            await databaseArticleService.createArticle('LoadTest Root', 'Content', 'Init');
        } catch (e) {
            console.log('Setup: Root article exists, continuing...');
        }

        const start = Date.now();
        const runId = Date.now();
        let totalOps = 0;
        let errors = 0;

        const clients = Array.from({ length: CONCURRENT_CLIENTS }, async (_, id) => {
            for (let i = 0; i < OPERATIONS_PER_CLIENT; i++) {
                try {
                    // Mix of read and write
                    if (i % 5 === 0) {
                        // Pass undefined for folder to avoid validaton error
                        await databaseArticleService.createArticle(`LoadTest ${runId}-${id}-${i}`, 'Content', undefined, 'Load test');
                    } else {
                        await databaseArticleService.readArticle('loadtest-root');
                    }
                    totalOps++;
                } catch (e) {
                    errors++;
                    if (errors <= 5) console.error('Load Test Error:', e);
                }
            }
        });

        await Promise.all(clients);

        const end = Date.now();
        const duration = (end - start) / 1000;
        const rps = totalOps / duration;

        console.log('\n📊 Load Test Results');
        console.log(`Duration: ${duration.toFixed(2)}s`);
        console.log(`Total Operations: ${totalOps}`);
        console.log(`Errors: ${errors}`);
        console.log(`Throughput: ${rps.toFixed(2)} ops/sec`);

        const poolStats = database.getPoolStats();
        console.log('Pool Stats:', poolStats);

        if (errors > 0) {
            console.log('⚠️  Errors detected during load test');
        } else {
            console.log('✅ Load test passed with zero errors');
        }

    } catch (error) {
        console.error('Load Test Failed:', error);
    } finally {
        await databaseInit.shutdown();
    }
}

runLoadTest();
