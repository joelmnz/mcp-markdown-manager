import { importService, ImportResult, ValidationResult, ImportOptions, ImportProgress as ServiceImportProgress } from './import.js';
import { existsSync } from 'fs';

export interface ImportStatus {
  phase: 'idle' | 'scanning' | 'validating' | 'importing' | 'completed' | 'error';
  processed: number;
  total: number;
  currentFile?: string;
  result?: ImportResult | ValidationResult;
  error?: string;
}

class ImportStatusService {
  private status: ImportStatus = {
    phase: 'idle',
    processed: 0,
    total: 0
  };

  private dataDir: string;

  constructor() {
    this.dataDir = process.env.DATA_DIR || './data';
  }

  getStatus(): ImportStatus & { dataDirAvailable: boolean, dataDir: string } {
    const dataDirAvailable = existsSync(this.dataDir);
    return {
      ...this.status,
      dataDirAvailable,
      dataDir: this.dataDir
    };
  }

  async validate(): Promise<ValidationResult> {
    if (this.status.phase === 'importing' || this.status.phase === 'validating') {
      throw new Error('Import or validation already in progress');
    }

    this.status = {
      phase: 'validating',
      processed: 0,
      total: 0
    };

    try {
      const result = await importService.validateImport(this.dataDir, {
        preserveFolderStructure: true
      });
      
      this.status = {
        phase: 'idle', // Go back to idle so user can start import
        processed: 0,
        total: result.totalFiles,
        result
      };
      
      return result;
    } catch (error) {
      this.status = {
        phase: 'error',
        processed: 0,
        total: 0,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      };
      throw error;
    }
  }

  async startImport(): Promise<void> {
    if (this.status.phase === 'importing') {
      throw new Error('Import already in progress');
    }

    this.status = {
      phase: 'importing',
      processed: 0,
      total: 0
    };

    // Run in background
    importService.importFromDirectory(this.dataDir, {
      preserveFolderStructure: true,
      conflictResolution: 'skip', // Default as requested
      progressCallback: (progress: ServiceImportProgress) => {
        this.status = {
          ...this.status,
          phase: 'importing',
          processed: progress.processed,
          total: progress.total,
          currentFile: progress.currentFile
        };
      }
    }).then(result => {
      this.status = {
        phase: 'completed',
        processed: result.imported,
        total: result.imported + result.skipped + result.errors.length,
        result
      };
    }).catch(error => {
      this.status = {
        phase: 'error',
        processed: this.status.processed,
        total: this.status.total,
        error: error instanceof Error ? error.message : 'Unknown import error'
      };
    });
  }
}

export const importStatusService = new ImportStatusService();
