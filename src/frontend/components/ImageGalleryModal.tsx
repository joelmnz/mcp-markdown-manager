import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../utils/apiClient';

interface ImageRecord {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: string;
}

interface ImageGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectImage: (markdown: string) => void;
  token: string;
}

export function ImageGalleryModal({ isOpen, onClose, onSelectImage, token }: ImageGalleryModalProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'gallery'>('upload');
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && activeTab === 'gallery') {
      loadImages();
    }
  }, [isOpen, activeTab]);

  const loadImages = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/images?limit=50', token);
      if (response.ok) {
        const data = await response.json();
        setImages(data.images);
      } else {
        setError('Failed to load images');
      }
    } catch (err) {
      setError('Error loading images');
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    try {
      setUploading(true);
      setError('');

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/images/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        // Switch to gallery view and select the uploaded image
        setActiveTab('gallery');
        loadImages(); // Reload to show new image
      } else {
        const err = await response.json();
        setError(err.error || 'Upload failed');
      }
    } catch (err) {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleImageSelect = (image: ImageRecord) => {
    // Generate standard markdown image syntax
    // Using relative path /api/images/filename
    const markdown = `![${image.original_name}](/api/images/${image.filename})`;
    onSelectImage(markdown);
    onClose();
  };

  const handleDeleteImage = async (e: React.MouseEvent, filename: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this image?')) return;

    try {
      const response = await apiClient.delete(`/api/images/${filename}`, token);
      if (response.ok) {
        loadImages();
      } else {
        setError('Failed to delete image');
      }
    } catch (err) {
      setError('Error deleting image');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content image-gallery-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Image Gallery</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          <button
            className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            Upload
          </button>
          <button
            className={`tab-button ${activeTab === 'gallery' ? 'active' : ''}`}
            onClick={() => setActiveTab('gallery')}
          >
            Gallery
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-message">{error}</div>}

          {activeTab === 'upload' && (
            <div
              className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="file-input"
                onChange={handleFileInput}
                accept="image/*"
                style={{ display: 'none' }}
              />

              {uploading ? (
                <div className="uploading-state">Uploading...</div>
              ) : (
                <div className="upload-prompt">
                  <p>Drag and drop an image here</p>
                  <p>or</p>
                  <button
                    className="button button-primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Select File
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'gallery' && (
            <div className="gallery-grid">
              {loading ? (
                <div>Loading images...</div>
              ) : images.length === 0 ? (
                <div className="no-images">No images found. Upload one!</div>
              ) : (
                images.map(img => (
                  <div
                    key={img.id}
                    className="gallery-item"
                    onClick={() => handleImageSelect(img)}
                  >
                    <div className="image-preview">
                      <img src={`/api/images/${img.filename}`} alt={img.original_name} />
                    </div>
                    <div className="image-info">
                      <span className="image-name" title={img.original_name}>{img.original_name}</span>
                      <button
                        className="delete-image-btn"
                        onClick={(e) => handleDeleteImage(e, img.filename)}
                        title="Delete image"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
