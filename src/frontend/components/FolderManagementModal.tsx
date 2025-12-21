import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

const AUTO_CLOSE_DELAY_MS = 1500; // Delay before auto-closing modal after successful operation

interface FolderManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: string[];
  selectedFolder: string;
  token: string;
  onFolderUpdate: () => void;
}

export function FolderManagementModal({
  isOpen,
  onClose,
  folders,
  selectedFolder,
  token,
  onFolderUpdate
}: FolderManagementModalProps) {
  const [folderToManage, setFolderToManage] = useState(selectedFolder || '');
  const [newFolderName, setNewFolderName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFolderToManage(selectedFolder || '');
      setNewFolderName('');
      setError('');
      setSuccess('');
      setShowDeleteConfirm(false);
    }
  }, [isOpen, selectedFolder]);

  const handleRename = async () => {
    if (!folderToManage) {
      setError('Please select a folder to rename');
      return;
    }

    if (!newFolderName.trim()) {
      setError('Please enter a new folder name');
      return;
    }

    if (newFolderName.trim() === folderToManage) {
      setError('New folder name must be different from the current name');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await apiClient.put(`/api/folders/${encodeURIComponent(folderToManage)}`, { newName: newFolderName.trim() }, token);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to rename folder');
      }

      setSuccess(data.message || 'Folder renamed successfully');
      setNewFolderName('');
      onFolderUpdate();
      
      // Close modal after short delay to show success message
      setTimeout(() => {
        onClose();
      }, AUTO_CLOSE_DELAY_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename folder');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!folderToManage) {
      setError('Please select a folder to delete');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await apiClient.delete(`/api/folders/${encodeURIComponent(folderToManage)}`, token);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete folder');
      }

      setSuccess(data.message || 'Folder deleted successfully');
      setShowDeleteConfirm(false);
      onFolderUpdate();
      
      // Close modal after short delay to show success message
      setTimeout(() => {
        onClose();
      }, AUTO_CLOSE_DELAY_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete folder');
      setShowDeleteConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-container">
        <div className="modal-header">
          <h2>Manage Folders</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <div className="form-group">
            <label htmlFor="folder-select">Select Folder:</label>
            <select
              id="folder-select"
              value={folderToManage}
              onChange={(e) => {
                setFolderToManage(e.target.value);
                setNewFolderName('');
                setError('');
                setSuccess('');
              }}
              className="folder-select"
              disabled={loading}
            >
              <option value="">-- Select a folder --</option>
              {folders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </div>

          {folderToManage && (
            <>
              <div className="form-group">
                <label htmlFor="new-folder-name">New Folder Name:</label>
                <input
                  id="new-folder-name"
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Enter new folder name"
                  className="input"
                  disabled={loading}
                />
              </div>

              <div className="modal-actions">
                <button
                  className="button button-primary"
                  onClick={handleRename}
                  disabled={loading || !newFolderName.trim()}
                >
                  {loading ? 'Renaming...' : 'Rename Folder'}
                </button>

                {!showDeleteConfirm ? (
                  <button
                    className="button button-danger"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={loading}
                  >
                    Delete Folder
                  </button>
                ) : (
                  <div className="delete-confirm">
                    <p className="delete-confirm-text">
                      Are you sure? This will remove the folder from all articles.
                    </p>
                    <div className="delete-confirm-actions">
                      <button
                        className="button button-danger"
                        onClick={handleDelete}
                        disabled={loading}
                      >
                        {loading ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                      <button
                        className="button button-secondary"
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={loading}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
