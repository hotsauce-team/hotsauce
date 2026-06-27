/**
 * Embedded JavaScript for the filesystem upload page.
 * Served via /_assets/upload.js route to avoid inline scripts.
 *
 * Flow (mirrors the S3 plugin, but bytes land on the app server):
 *   1. POST file metadata to this page's URL → receive { key, upload } with a
 *      signed, single-use upload URL pointing back at the plugin's own route.
 *   2. Read the file as base64 and POST it as JSON to that upload URL. (Plugin
 *      route bodies are text-decoded by the CMS, so binary is base64-encoded to
 *      survive transit faithfully.)
 *   3. Save the FileReference onto the record.
 *
 * Reads configuration from a <script type="application/json" id="upload-config">
 * element in the page.
 */
export const UPLOAD_JS = `
(function() {
  const config = JSON.parse(document.getElementById('upload-config').textContent);

  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const progressBar = document.getElementById('progressBar');
  const progress = document.getElementById('progress');
  const status = document.getElementById('status');
  const fileInfo = document.getElementById('fileInfo');

  uploadArea.addEventListener('click', function() { fileInput.click(); });
  uploadArea.addEventListener('dragover', function(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', function() {
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', function(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  function formatSize(bytes) {
    return bytes >= 1048576
      ? Math.round(bytes / 1048576) + 'MB'
      : Math.round(bytes / 1024) + 'KB';
  }

  // Show upload hints (max size, accepted types)
  (function() {
    var hints = [];
    if (config.maxSize) hints.push('Max size: ' + formatSize(config.maxSize));
    if (config.accept) hints.push('Accepted: ' + config.accept);
    if (hints.length) {
      var el = document.getElementById('uploadHints');
      el.textContent = hints.join(' \\u00b7 ');
      el.style.display = 'block';
    }
  })();

  fileInput.addEventListener('change', function() {
    if (fileInput.files.length) {
      handleFile(fileInput.files[0]);
    }
  });

  function handleFile(file) {
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = Math.round(file.size / 1024) + ' KB';
    document.getElementById('fileType').textContent = file.type || 'application/octet-stream';
    fileInfo.style.display = 'block';

    if (config.maxSize && file.size > config.maxSize) {
      status.textContent = 'File too large. Maximum size is ' + formatSize(config.maxSize) + '.';
      status.className = 'status error';
      return;
    }

    status.textContent = 'Preparing upload...';
    status.className = 'status';
    progressBar.style.display = 'none';

    doUpload(file).catch(function(err) {
      status.textContent = 'Error: ' + err.message;
      status.className = 'status error';
      progressBar.style.display = 'none';
    });
  }

  // Read a File as base64 (without the data: prefix).
  function readAsBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() {
        var result = reader.result || '';
        var comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : '');
      };
      reader.onerror = function() { reject(new Error('Could not read file')); };
      reader.readAsDataURL(file);
    });
  }

  function doUpload(file) {
    // Step 1: Get signed upload URL (POST metadata to this page).
    return fetch(window.location.href, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': config.csrfToken,
      },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      }),
    }).then(function(presignRes) {
      if (!presignRes.ok) {
        return presignRes.json().catch(function() {
          return { error: 'Server error (' + presignRes.status + ')' };
        }).then(function(err) {
          throw new Error(err.error || 'Failed to prepare upload');
        });
      }
      return presignRes.json();
    }).then(function(presignData) {
      status.textContent = 'Uploading to server...';
      progressBar.style.display = 'block';
      progress.style.width = '50%';

      // Step 2: base64-encode and POST the bytes to the signed upload URL.
      return readAsBase64(file).then(function(base64) {
        var upload = presignData.upload;
        var headers = upload.headers || {};
        headers['X-CSRF-Token'] = config.csrfToken;
        return fetch(upload.url, {
          method: upload.method,
          headers: headers,
          body: JSON.stringify({ data: base64 }),
        }).then(function(putRes) {
          progress.style.width = '100%';
          if (!putRes.ok) {
            return putRes.json().catch(function() {
              return { error: 'Upload failed (' + putRes.status + ')' };
            }).then(function(err) {
              throw new Error(err.error || 'Upload failed');
            });
          }
          return presignData;
        });
      });
    }).then(function(presignData) {
      status.textContent = 'Saving to record...';

      // Step 3: Save FileReference to record.
      var fileReference = {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        storage: presignData.storage,
        key: presignData.key,
      };
      var formData = new FormData();
      formData.append(config.column, JSON.stringify(fileReference));
      formData.append('__cms_csrf', config.csrfToken);
      formData.append('__cms_source', config.sourceToken);

      return fetch(config.basePath + '/' + config.table + '/' + config.recordId, {
        method: 'POST',
        body: formData,
      });
    }).then(function(saveRes) {
      if (!saveRes.ok) {
        return saveRes.text().then(function(errText) {
          throw new Error('Failed to save: ' + saveRes.status + ' ' + errText.slice(0, 100));
        });
      }

      status.textContent = 'Upload complete! Redirecting...';
      status.className = 'status success';

      var redirectUrl = config.returnUrl || (config.basePath + '/' + config.table + '/' + config.recordId + '/edit');
      setTimeout(function() {
        window.location.href = redirectUrl;
      }, 1000);
    });
  }
})();
`;
