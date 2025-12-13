-- Initialize required PostgreSQL extensions for Article Manager
-- This script runs automatically when the PostgreSQL container starts

-- Connect to the article_manager database
\c article_manager;

-- Install required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE article_manager TO article_user;
GRANT ALL ON SCHEMA public TO article_user;

-- Set up vector extension configuration
-- Adjust these settings based on your embedding model dimensions
-- Default is 512 for nomic-embed-text, adjust if using different model
ALTER DATABASE article_manager SET vector.max_dimensions = 2048;

-- Log successful initialization
SELECT 'PostgreSQL extensions initialized successfully' AS status;