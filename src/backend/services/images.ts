import { database } from './database.js';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export interface ImageRecord {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: Date;
  created_by?: string;
}

export interface ImageUploadResult {
  success: boolean;
  filename: string;
  record?: ImageRecord;
  error?: string;
}

export interface ImageAuditResult {
  missingFiles: ImageRecord[];  // Records in DB but file missing on disk
  orphanedFiles: string[];      // Files on disk but no record in DB
}

export class ImageService {
  private imagesDir: string;

  constructor() {
    this.imagesDir = process.env.IMAGES_DIR || './images';
  }

  /**
   * Ensure the images directory exists
   */
  async ensureImageDir(): Promise<void> {
    try {
      await fs.access(this.imagesDir);
    } catch {
      console.log(`Creating images directory at ${this.imagesDir}`);
      await fs.mkdir(this.imagesDir, { recursive: true });
    }
  }

  /**
   * Save an image file and create a database record
   */
  async saveImage(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    createdBy?: string
  ): Promise<ImageUploadResult> {
    try {
      await this.ensureImageDir();

      // Generate a unique filename to prevent collisions
      const ext = path.extname(originalName) || '';
      const uniqueId = randomUUID();
      const filename = `${uniqueId}${ext}`;
      const filePath = path.join(this.imagesDir, filename);

      // Write file to disk
      await fs.writeFile(filePath, fileBuffer);
      const stats = await fs.stat(filePath);
      const size = stats.size;

      // Create database record
      const query = `
        INSERT INTO images (filename, original_name, mime_type, size, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const result = await database.query(query, [
        filename,
        originalName,
        mimeType,
        size,
        createdBy
      ]);

      return {
        success: true,
        filename,
        record: result.rows[0] as ImageRecord
      };
    } catch (error) {
      console.error('Error saving image:', error);
      return {
        success: false,
        filename: '',
        error: error instanceof Error ? error.message : 'Unknown error saving image'
      };
    }
  }

  /**
   * Get an image record by filename
   */
  async getImageRecord(filename: string): Promise<ImageRecord | null> {
    try {
      const result = await database.query(
        'SELECT * FROM images WHERE filename = $1',
        [filename]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as ImageRecord;
    } catch (error) {
      console.error('Error fetching image record:', error);
      return null;
    }
  }

  /**
   * Get the full path to an image file
   */
  getImagePath(filename: string): string {
    // Prevent directory traversal attacks
    const safeFilename = path.basename(filename);
    return path.join(this.imagesDir, safeFilename);
  }

  /**
   * List all images with pagination
   */
  async listImages(limit: number = 50, offset: number = 0): Promise<{ images: ImageRecord[], total: number }> {
    try {
      const countResult = await database.query('SELECT COUNT(*) FROM images');
      const total = parseInt(countResult.rows[0].count, 10);

      const result = await database.query(
        'SELECT * FROM images ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );

      return {
        images: result.rows as ImageRecord[],
        total
      };
    } catch (error) {
      console.error('Error listing images:', error);
      return { images: [], total: 0 };
    }
  }

  /**
   * Delete an image (file and record)
   */
  async deleteImage(filename: string): Promise<boolean> {
    try {
      // Get record first to ensure it exists
      const record = await this.getImageRecord(filename);
      if (!record) {
        return false;
      }

      // Delete from database
      await database.query('DELETE FROM images WHERE filename = $1', [filename]);

      // Delete from disk
      const filePath = this.getImagePath(filename);
      try {
        await fs.unlink(filePath);
      } catch (fsError) {
        console.warn(`Failed to delete image file ${filePath} (might be already missing):`, fsError);
      }

      return true;
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  }

  /**
   * Audit images to find inconsistencies between DB and filesystem
   */
  async auditImages(): Promise<ImageAuditResult> {
    try {
      await this.ensureImageDir();

      // Get all DB records
      const dbResult = await database.query('SELECT * FROM images');
      const dbRecords = dbResult.rows as ImageRecord[];
      const dbFilenames = new Set(dbRecords.map(r => r.filename));

      // Get all files on disk
      let files: string[] = [];
      try {
        files = await fs.readdir(this.imagesDir);
      } catch (err) {
        console.warn('Could not read images directory:', err);
      }

      const diskFilenames = new Set(files.filter(f => !f.startsWith('.'))); // Ignore hidden files

      // Find missing files (in DB but not on disk)
      const missingFiles = dbRecords.filter(r => !diskFilenames.has(r.filename));

      // Find orphaned files (on disk but not in DB)
      const orphanedFiles = files.filter(f => !f.startsWith('.') && !dbFilenames.has(f));

      return {
        missingFiles,
        orphanedFiles
      };
    } catch (error) {
      console.error('Error auditing images:', error);
      throw error;
    }
  }

  /**
   * Cleanup orphaned files
   */
  async cleanupOrphans(filenames: string[]): Promise<number> {
    let deletedCount = 0;

    for (const filename of filenames) {
      try {
        const filePath = this.getImagePath(filename);

        // Double check it's not in DB to be safe
        const record = await this.getImageRecord(filename);
        if (record) {
          console.warn(`Skipping cleanup of ${filename} as it now exists in DB`);
          continue;
        }

        await fs.unlink(filePath);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete orphaned file ${filename}:`, error);
      }
    }

    return deletedCount;
  }
}

export const imageService = new ImageService();
