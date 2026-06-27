/**
 * Embedded CSS for the filesystem upload page.
 * Served via /_assets/upload.css route to avoid inline styles.
 */
export const UPLOAD_CSS = `
.upload-container { max-width: 600px; margin: 2rem auto; padding: 1rem; }
.upload-area {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s;
}
.upload-area:hover, .upload-area.dragover {
  border-color: #4a90d9;
  background: #f0f7ff;
}
.upload-area input[type="file"] { display: none; }
.progress-bar {
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
  margin: 1rem 0;
  display: none;
}
.progress-bar .progress {
  height: 100%;
  background: #4a90d9;
  width: 0%;
  transition: width 0.2s;
}
.status { margin: 1rem 0; }
.status.error { color: #d32f2f; }
.status.success { color: #388e3c; }
.file-info { margin: 1rem 0; padding: 1rem; background: #f5f5f5; border-radius: 4px; }
.upload-hints { display: none; color: #666; font-size: 0.9em; margin-top: 0.5rem; }
.back-link { margin-top: 2rem; }
.btn { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; }
.btn-primary { background: #4a90d9; color: white; }
.btn-secondary { background: #ccc; color: #333; }
`;
