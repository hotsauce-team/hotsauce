/**
 * Embedded JavaScript for the S3 upload page.
 * Served via /_assets/upload.js route to avoid inline scripts.
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
    // Show file info
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = Math.round(file.size / 1024) + ' KB';
    document.getElementById('fileType').textContent = file.type || 'application/octet-stream';
    fileInfo.style.display = 'block';

    // Client-side validation
    if (config.maxSize && file.size > config.maxSize) {
      status.textContent = 'File too large. Maximum size is ' + formatSize(config.maxSize) + '.';
      status.className = 'status error';
      return;
    }

    status.textContent = 'Getting presigned URL...';
    status.className = 'status';
    progressBar.style.display = 'none';

    doUpload(file).catch(function(err) {
      status.textContent = 'Error: ' + err.message;
      status.className = 'status error';
      progressBar.style.display = 'none';
    });
  }

  function doUpload(file) {
    // Step 1: Get presigned URL (POST to same URL)
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
          throw new Error(err.error || 'Failed to get presigned URL');
        });
      }
      return presignRes.json();
    }).then(function(presignData) {
      status.textContent = 'Uploading to storage...';
      progressBar.style.display = 'block';

      // Step 2: Upload to S3
      return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', function(e) {
          if (e.lengthComputable) {
            var pct = Math.round((e.loaded / e.total) * 100);
            progress.style.width = pct + '%';
          }
        });
        xhr.addEventListener('load', function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(presignData);
          } else {
            var detail = xhr.responseText || '';
            var match = detail.match(/<Message>([^<]+)<\\/Message>/);
            if (match) detail = match[1];
            reject(new Error('Upload failed (' + xhr.status + '): ' + (detail || 'Unknown error')));
          }
        });
        xhr.addEventListener('error', function() {
          reject(new Error('Upload failed: Network error (check browser console)'));
        });
        xhr.open(presignData.upload.method, presignData.upload.url);
        var headers = presignData.upload.headers || {};
        for (var k in headers) {
          if (headers.hasOwnProperty(k)) xhr.setRequestHeader(k, headers[k]);
        }
        xhr.send(file);
      });
    }).then(function(presignData) {
      status.textContent = 'Saving to record...';

      // Step 3: Save FileReference to record
      var fileReference = {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        storage: presignData.storage,
        key: presignData.key,
      };
      var formData = new FormData();
      formData.append(config.column, JSON.stringify(fileReference));
      formData.append('_csrf', config.csrfToken);
      formData.append('_source', config.sourceToken);

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

      setTimeout(function() {
        window.location.href = config.basePath + '/' + config.table + '/' + config.recordId + '/edit';
      }, 1000);
    });
  }
})();
`;
