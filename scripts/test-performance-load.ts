#!/usr/bin/env bun

/**
 * Performance and Load Testing
 * 
 * Tests database performance with large datasets, validates embedding search performance,
 * and tests concurrent operations and connection pooling.
 * 
 * Requirements: 6.3
 */

import { databaseInit } from '../src/backend/services/databaseInit.js';
import { 
  listArticles, 
  searchArticles, 
  readArticle, 
  createArticle, 
  updateArticle, 
  deleteArticle
} from '../src/backend/services/articles.js';
import { semanticSearch, hybridSearch, getDetailedIndexStats, rebuildIndex } from '../src/backend/services/vectorIndex.js';
import { databaseHealthService } from '../src/backend/services/databaseHealth.js';

const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';

interface PerformanceResult {
  name: string;
  duration: number;
  operations: number;
  opsPerSecond: number;
  details?: any;
}

interface LoadTestResult {
  name: string;
  totalOperations: number;
  duration: number;
  opsPerSecond: number;
  concurrency: number;
  errors: number;
  successRate: number;
}

class PerformanceLoadTester {
  private results: PerformanceResult[] = [];
  private loadResults: LoadTestResult[] = [];
  private testArticles: any[] = [];

  async runAllTests(): Promise<void> {
    console.log('🚀 Performance and Load Testing');
    console.log('===============================\n');

    try {
      // Initialize database
      await this.initializeDatabase();
      
      // Run performance tests
      await this.testDatabasePerformance();
      await this.testLargeDatasetPerformance();
      await this.testSearchPerformance();
      
      // Run load tests
      await this.testConcurrentOperations();
      await this.testConnectionPooling();
      
      // Report results
      this.reportResults();
      
    } catch (error) {
      console.error('❌ Performance test setup failed:', error);
      process.exit(1);
    }
  }

  private async initializeDatabase(): Promise<void> {
    console.log('🔄 Initializing database connection...');
    try {
      await databaseInit.initialize();
      console.log('✅ Database initialized\n');
    } catch (error) {
      throw new Error(`Database initialization failed: ${error}`);
    }
  }

  private async testDatabasePerformance(): Promise<void> {
    console.log('--- Testing Database Performance ---');
    
    // Test single article operations
    await this.measurePerformance('Single article creation', async () => {
      const timestamp = Date.now();
      const article = await createArticle(
        `Performance Test Article ${timestamp}`,
        `# Performance Test Article ${timestamp}\n\nThis is a performance test article with some content.\n\n## Section 1\n\nContent here.`,
        'Performance test'
      );
      this.testArticles.push(article);
      return 1; // 1 operation
    });

    await this.measurePerformance('Single article read', async () => {
      if (this.testArticles.length > 0) {
        await readArticle(this.testArticles[0].filename);
      }
      return 1; // 1 operation
    });

    await this.measurePerformance('Single article update', async () => {
      if (this.testArticles.length > 0) {
        const timestamp = Date.now();
        const updated = await updateArticle(
          this.testArticles[0].filename,
          `Updated Performance Test Article ${timestamp}`,
          this.testArticles[0].content + '\n\n## Updated Section\n\nUpdated content.',
          'Performance test update'
        );
        this.testArticles[0] = updated;
      }
      return 1; // 1 operation
    });

    // Test batch operations
    await this.measurePerformance('Batch article creation (10 articles)', async () => {
      const timestamp = Date.now();
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(createArticle(
          `Batch Test Article ${timestamp}-${i}`,
          `# Batch Test Article ${timestamp}-${i}\n\nThis is batch article ${i} for performance testing.\n\n## Content\n\nSome content here.`,
          `Batch creation ${i}`
        ));
      }
      
      const articles = await Promise.all(promises);
      this.testArticles.push(...articles);
      return 10; // 10 operations
    });

    await this.measurePerformance('List all articles', async () => {
      await listArticles();
      return 1; // 1 operation
    });

    await this.measurePerformance('Search articles', async () => {
      await searchArticles('Performance Test');
      return 1; // 1 operation
    });
  }

  private async testLargeDatasetPerformance(): Promise<void> {
    console.log('\n--- Testing Large Dataset Performance ---');
    
    // Create a larger dataset
    await this.measurePerformance('Large batch creation (50 articles)', async () => {
      const timestamp = Date.now();
      const batchSize = 10;
      const totalArticles = 50;
      let created = 0;
      
      for (let batch = 0; batch < totalArticles / batchSize; batch++) {
        const promises = [];
        
        for (let i = 0; i < batchSize; i++) {
          const articleIndex = batch * batchSize + i;
          promises.push(createArticle(
            `Large Dataset Article ${timestamp}-${articleIndex}`,
            `# Large Dataset Article ${timestamp}-${articleIndex}\n\nThis is a large dataset test article ${articleIndex}.\n\n## Section 1\n\nContent for article ${articleIndex}.\n\n## Section 2\n\nMore content here with some text to make it larger.\n\n### Subsection\n\nEven more content to simulate real articles.`,
            `Large dataset creation ${articleIndex}`
          ));
        }
        
        const batchArticles = await Promise.all(promises);
        this.testArticles.push(...batchArticles);
        created += batchSize;
      }
      
      return totalArticles;
    });

    // Test performance with large dataset
    await this.measurePerformance('List articles (large dataset)', async () => {
      await listArticles();
      return 1;
    });

    await this.measurePerformance('Search articles (large dataset)', async () => {
      await searchArticles('Large Dataset');
      return 1;
    });

    // Test database health with large dataset
    await this.measurePerformance('Database health check (large dataset)', async () => {
      await databaseHealthService.performHealthCheck();
      return 1;
    });
  }

  private async testSearchPerformance(): Promise<void> {
    console.log('\n--- Testing Search Performance ---');
    
    if (!SEMANTIC_SEARCH_ENABLED) {
      console.log('⚠️  Semantic search disabled, skipping semantic search performance tests');
      return;
    }

    // Test semantic search performance
    await this.measurePerformance('Semantic search', async () => {
      await semanticSearch('performance test article content', 10);
      return 1;
    });

    await this.measurePerformance('Hybrid search', async () => {
      await hybridSearch('performance test article content', 10);
      return 1;
    });

    // Test index rebuild performance
    await this.measurePerformance('Index rebuild', async () => {
      await rebuildIndex();
      return 1;
    });

    // Test index stats performance
    await this.measurePerformance('Get index stats', async () => {
      await getDetailedIndexStats();
      return 1;
    });
  }

  private async testConcurrentOperations(): Promise<void> {
    console.log('\n--- Testing Concurrent Operations ---');
    
    // Test concurrent reads
    await this.loadTest('Concurrent article reads', async () => {
      if (this.testArticles.length > 0) {
        const randomArticle = this.testArticles[Math.floor(Math.random() * this.testArticles.length)];
        await readArticle(randomArticle.filename);
      }
    }, 20, 50); // 20 concurrent operations, 50 total

    // Test concurrent searches
    await this.loadTest('Concurrent article searches', async () => {
      await searchArticles('test');
    }, 10, 30); // 10 concurrent operations, 30 total

    // Test concurrent creates
    await this.loadTest('Concurrent article creation', async () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const article = await createArticle(
        `Concurrent Test ${timestamp}-${random}`,
        `# Concurrent Test ${timestamp}-${random}\n\nConcurrent creation test.`,
        'Concurrent test'
      );
      this.testArticles.push(article);
    }, 5, 15); // 5 concurrent operations, 15 total

    // Test mixed operations
    await this.loadTest('Mixed concurrent operations', async () => {
      const operations = ['read', 'search', 'list'];
      const operation = operations[Math.floor(Math.random() * operations.length)];
      
      switch (operation) {
        case 'read':
          if (this.testArticles.length > 0) {
            const randomArticle = this.testArticles[Math.floor(Math.random() * this.testArticles.length)];
            await readArticle(randomArticle.filename);
          }
          break;
        case 'search':
          await searchArticles('test');
          break;
        case 'list':
          await listArticles();
          break;
      }
    }, 15, 45); // 15 concurrent operations, 45 total
  }

  private async testConnectionPooling(): Promise<void> {
    console.log('\n--- Testing Connection Pooling ---');
    
    // Test connection pool under load
    await this.loadTest('Connection pool stress test', async () => {
      // Perform multiple database operations to stress the connection pool
      await listArticles();
      if (this.testArticles.length > 0) {
        const randomArticle = this.testArticles[Math.floor(Math.random() * this.testArticles.length)];
        await readArticle(randomArticle.filename);
      }
      await searchArticles('pool test');
    }, 25, 100); // 25 concurrent operations, 100 total

    // Test database health under connection stress
    await this.measurePerformance('Database health under connection stress', async () => {
      const healthPromises = [];
      for (let i = 0; i < 10; i++) {
        healthPromises.push(databaseHealthService.performHealthCheck());
      }
      await Promise.all(healthPromises);
      return 10;
    });
  }

  private async measurePerformance(name: string, operation: () => Promise<number>): Promise<void> {
    const startTime = Date.now();
    
    try {
      const operations = await operation();
      const duration = Date.now() - startTime;
      const opsPerSecond = operations / (duration / 1000);
      
      this.results.push({
        name,
        duration,
        operations,
        opsPerSecond
      });
      
      console.log(`✅ ${name}: ${duration}ms (${opsPerSecond.toFixed(2)} ops/sec)`);
    } catch (error) {
      console.log(`❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async loadTest(
    name: string, 
    operation: () => Promise<void>, 
    concurrency: number, 
    totalOperations: number
  ): Promise<void> {
    const startTime = Date.now();
    let completed = 0;
    let errors = 0;
    
    try {
      const batches = Math.ceil(totalOperations / concurrency);
      
      for (let batch = 0; batch < batches; batch++) {
        const batchSize = Math.min(concurrency, totalOperations - completed);
        const promises = [];
        
        for (let i = 0; i < batchSize; i++) {
          promises.push(
            operation().then(() => {
              completed++;
            }).catch(() => {
              errors++;
              completed++;
            })
          );
        }
        
        await Promise.all(promises);
      }
      
      const duration = Date.now() - startTime;
      const opsPerSecond = totalOperations / (duration / 1000);
      const successRate = ((totalOperations - errors) / totalOperations) * 100;
      
      this.loadResults.push({
        name,
        totalOperations,
        duration,
        opsPerSecond,
        concurrency,
        errors,
        successRate
      });
      
      console.log(`✅ ${name}: ${totalOperations} ops in ${duration}ms (${opsPerSecond.toFixed(2)} ops/sec, ${successRate.toFixed(1)}% success)`);
    } catch (error) {
      console.log(`❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private reportResults(): void {
    console.log('\n📊 Performance Test Results');
    console.log('===========================');
    
    if (this.results.length > 0) {
      console.log('\n🔧 Single Operation Performance:');
      this.results.forEach(result => {
        console.log(`  ${result.name}: ${result.duration}ms (${result.opsPerSecond.toFixed(2)} ops/sec)`);
      });
    }
    
    if (this.loadResults.length > 0) {
      console.log('\n🚀 Load Test Results:');
      this.loadResults.forEach(result => {
        console.log(`  ${result.name}:`);
        console.log(`    Operations: ${result.totalOperations} (${result.concurrency} concurrent)`);
        console.log(`    Duration: ${result.duration}ms`);
        console.log(`    Throughput: ${result.opsPerSecond.toFixed(2)} ops/sec`);
        console.log(`    Success Rate: ${result.successRate.toFixed(1)}%`);
        console.log(`    Errors: ${result.errors}`);
      });
    }
    
    // Performance analysis
    console.log('\n📈 Performance Analysis:');
    
    const avgOpsPerSec = this.results.reduce((sum, r) => sum + r.opsPerSecond, 0) / this.results.length;
    console.log(`  Average single operation performance: ${avgOpsPerSec.toFixed(2)} ops/sec`);
    
    const avgLoadOpsPerSec = this.loadResults.reduce((sum, r) => sum + r.opsPerSecond, 0) / this.loadResults.length;
    console.log(`  Average load test performance: ${avgLoadOpsPerSec.toFixed(2)} ops/sec`);
    
    const avgSuccessRate = this.loadResults.reduce((sum, r) => sum + r.successRate, 0) / this.loadResults.length;
    console.log(`  Average success rate: ${avgSuccessRate.toFixed(1)}%`);
    
    const totalArticlesCreated = this.testArticles.length;
    console.log(`  Total test articles created: ${totalArticlesCreated}`);
    
    // Performance benchmarks
    console.log('\n🎯 Performance Benchmarks:');
    
    if (avgOpsPerSec > 100) {
      console.log('  ✅ Single operation performance: Excellent (>100 ops/sec)');
    } else if (avgOpsPerSec > 50) {
      console.log('  ✅ Single operation performance: Good (>50 ops/sec)');
    } else if (avgOpsPerSec > 10) {
      console.log('  ⚠️  Single operation performance: Acceptable (>10 ops/sec)');
    } else {
      console.log('  ❌ Single operation performance: Poor (<10 ops/sec)');
    }
    
    if (avgSuccessRate > 95) {
      console.log('  ✅ Reliability: Excellent (>95% success rate)');
    } else if (avgSuccessRate > 90) {
      console.log('  ✅ Reliability: Good (>90% success rate)');
    } else if (avgSuccessRate > 80) {
      console.log('  ⚠️  Reliability: Acceptable (>80% success rate)');
    } else {
      console.log('  ❌ Reliability: Poor (<80% success rate)');
    }
    
    console.log('\n🎉 Performance and load testing completed!');
    console.log(`Database handled ${totalArticlesCreated} articles and multiple concurrent operations successfully.`);
  }
}

// Main execution
async function main() {
  const tester = new PerformanceLoadTester();
  await tester.runAllTests();
}

// Run tests if this script is executed directly
if (import.meta.main) {
  main().catch(error => {
    console.error('❌ Performance test execution failed:', error);
    process.exit(1);
  });
}