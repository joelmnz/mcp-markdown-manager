import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

const AUTO_CLOSE_DELAY_MS = 1500;

interface RenameSlugModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSlug: string;
  token: string;
  onSlugRenamed: (newFilename: string) => void;
}

export function RenameSlugModal({
  isOpen,
  onClose,
  currentSlug,
  token,
  onSlugRenamed
}: RenameSlugModalProps) {
  const [newSlug, setNewSlug] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNewSlug(currentSlug);
      setError('');
      setSuccess('');
    }
  }, [isOpen, currentSlug]);

  const handleRename = async () => {
    if (!newSlug.trim()) {
      setError('Slug cannot be empty');
      return;
    }

    if (newSlug.trim() === currentSlug) {
      setError('New slug must be different from the current slug');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await apiClient.post(
        `/api/articles/${currentSlug}.md/rename-slug`,
        { newSlug: newSlug.trim() },
        token
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to rename slug');
      }

      setSuccess('Slug renamed successfully');

      setTimeout(() => {
        onSlugRenamed(data.article.filename);
        onClose();
      }, AUTO_CLOSE_DELAY_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename slug');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleRename();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Rename Article Slug</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            The article slug is used as the filename and in URLs. It must be unique.
          </p>

          <div className="form-group">
            <label htmlFor="current-slug">Current Slug</label>
            <input
              id="current-slug"
              type="text"
              value={currentSlug}
              disabled
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="new-slug">New Slug</label>
            <input
              id="new-slug"
              type="text"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter new slug"
              className="form-input"
              autoFocus
              disabled={loading}
            />
            <small className="form-hint">
              Use lowercase letters, numbers, and hyphens only
            </small>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
        </div>

        <div className="modal-footer">
          <button
            className="button button-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            onClick={handleRename}
            disabled={loading || !newSlug.trim()}
          >
            {loading ? 'Renaming...' : 'Rename Slug'}
          </button>
        </div>
      </div>
    </div>
  );
}
