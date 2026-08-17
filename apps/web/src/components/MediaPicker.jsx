import { useState } from 'react';
import { uploadFile } from '../lib/api';

export default function MediaPicker({
  label = 'Photo',
  folder = 'general',
  accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt',
  value,
  onChange,
  hint,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = value?.url || '';
  const isImage = !value?.resourceType || value.resourceType === 'image' || /\.(png|jpe?g|gif|webp)$/i.test(url);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const uploaded = await uploadFile(file, { folder });
      onChange?.(uploaded);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="media-picker">
      <span className="media-picker-label">{label}</span>
      <div className="media-picker-row">
        {url && isImage ? (
          <img src={url} alt="" className="media-picker-thumb" />
        ) : url ? (
          <a href={url} target="_blank" rel="noreferrer" className="media-picker-file">
            {value.originalName || 'Open file'}
          </a>
        ) : (
          <div className="media-picker-placeholder">No file</div>
        )}
        <div className="media-picker-actions">
          <label className="btn btn-secondary">
            {busy ? 'Uploading…' : url ? 'Replace' : 'Upload'}
            <input type="file" accept={accept} hidden disabled={busy} onChange={onFile} />
          </label>
          {url ? (
            <button type="button" className="btn btn-ghost" onClick={() => onChange?.(null)}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
      {error ? <div className="alert">{error}</div> : null}
    </div>
  );
}
