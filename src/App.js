 import React, { useState, useRef } from "react";
import "./App.css";

function App() {
  // ---------- State ----------
  const [mode, setMode] = useState("single"); // "single" or "3d"
  const [singleFile, setSingleFile] = useState(null);
  const [singlePreview, setSinglePreview] = useState(null);

  // For 3D mode
  const [sliceFiles, setSliceFiles] = useState([]);      // array of File objects
  const [slicePreviews, setSlicePreviews] = useState([]); // array of URLs
  const [sliceMasks, setSliceMasks] = useState([]);      // optional: base64 overlays per slice

  const [overlay, setOverlay] = useState(null);          // single-mode overlay
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stlData, setStlData] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const dropRef = useRef(null);

  // ---------- Single file handlers ----------
  const handleSingleFile = (fileObj) => {
    setSingleFile(fileObj);
    setSinglePreview(URL.createObjectURL(fileObj));
    setOverlay(null);
    setResult(null);
    setStlData(null);
  };

  const handleSingleFileChange = (e) => {
    const img = e.target.files?.[0];
    if (img) handleSingleFile(img);
  };

  // ---------- Folder / multi‑slice handlers ----------
  const handleFolderUpload = (e) => {
    const files = Array.from(e.target.files).filter((f) =>
      /\.(png|jpe?g|tif?f)$/i.test(f.name)
    );
    if (files.length === 0) {
      alert("No image files found in the selected folder.");
      return;
    }
    // Sort by slice index (assuming numeric suffix)
    files.sort((a, b) => {
      const getNum = (name) => parseInt(name.match(/\d+/)?.[0] || "0", 10);
      return getNum(a.name) - getNum(b.name);
    });

    setSliceFiles(files);
    const previews = files.map((f) => URL.createObjectURL(f));
    setSlicePreviews(previews);
    setSliceMasks([]); // will be filled after inference
    setStlData(null);
    setResult(null);
    setMode("3d");
  };

  // ---------- Drag & drop (supports single or multiple) ----------
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const items = e.dataTransfer.items;
    if (items) {
      // Check if it's a folder (webkitGetAsEntry)
      const entry = items[0]?.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        // Read folder contents
        const reader = entry.createReader();
        const allEntries = [];
        const readEntries = () => {
          reader.readEntries((entries) => {
            if (entries.length === 0) {
              // Process all files from the folder
              const files = allEntries
                .filter((e) => e.isFile)
                .map((e) => {
                  return new Promise((resolve) => {
                    e.file((f) => resolve(f));
                  });
                });
              Promise.all(files).then((fileArray) => {
                // Simulate folder upload
                const event = { target: { files: fileArray } };
                handleFolderUpload(event);
              });
              return;
            }
            allEntries.push(...entries);
            readEntries();
          });
        };
        readEntries();
        return;
      }
    }

    // Fallback: treat as single file drop
    if (e.dataTransfer.files && e.dataTransfer.files.length === 1) {
      handleSingleFile(e.dataTransfer.files[0]);
      setMode("single");
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 1) {
      // Treat as multiple files (manual selection)
      const event = { target: { files: e.dataTransfer.files } };
      handleFolderUpload(event);
    }
  };

  // ---------- Inference ----------
  const runInference = async () => {
    if (mode === "single") {
      if (!singleFile) {
        alert("Please upload an MRI image first.");
        return;
      }
      setLoading(true);
      const formData = new FormData();
      formData.append("image", singleFile);

      try {
        const res = await fetch("https://mridetectorbackend.onrender.com/predict", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || "Prediction failed");
          setLoading(false);
          return;
        }
        setOverlay(`data:image/png;base64,${data.overlay_2d}`);
        setResult({
          tumorProbability: data.tumor_probability,
          classifierPrediction: data.classifier_prediction,
          visibleTumor: data.visible_tumor,
          visiblePixels: data.visible_pixels,
        });
        if (data.stl_base64) {
          setStlData(data.stl_base64);
        }
      } catch (err) {
        console.error(err);
        alert("Could not connect to backend. Is it running?");
      }
      setLoading(false);
    } else if (mode === "3d") {
      if (sliceFiles.length === 0) {
        alert("Please load a patient folder first.");
        return;
      }
      setLoading(true);
      const formData = new FormData();
      sliceFiles.forEach((file, idx) => {
        formData.append(`slice_${idx}`, file);
      });

      // Call the new 3D endpoint (you need to implement this on the backend)
      try {
        const res = await fetch("https://mridetectorbackend.onrender.com/predict_3d", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || "3D prediction failed");
          setLoading(false);
          return;
        }
        // Assume response: { stl_base64, slice_count, tumor_slices, ... }
        setResult({
          sliceCount: data.slice_count,
          tumorSlices: data.tumor_slices,
          visibleTumor: data.tumor_slices > 0,
        });
        if (data.stl_base64) {
          setStlData(data.stl_base64);
        }
        // If backend returns overlay for each slice, we could display them
        // For now, we just show a success message
        alert(`3D reconstruction complete! ${data.tumor_slices} slices with tumor.`);
      } catch (err) {
        console.error(err);
        alert("3D backend not available. Please implement /predict_3d.");
      }
      setLoading(false);
    }
  };

  // ---------- STL download ----------
  const downloadSTL = () => {
    if (!stlData) return;
    const blob = new Blob(
      [Uint8Array.from(atob(stlData), (c) => c.charCodeAt(0))],
      { type: "application/sla" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tumor.stl";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------- Clear ----------
  const clearAll = () => {
    setSingleFile(null);
    setSinglePreview(null);
    setSliceFiles([]);
    setSlicePreviews([]);
    setSliceMasks([]);
    setOverlay(null);
    setResult(null);
    setStlData(null);
    setMode("single");
  };

  // ---------- Render ----------
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <span className="logo">🧠</span>
          <h1>MRI Tumor Detector</h1>
        </div>
        <span className="header-subtitle">AI‑powered hybrid segmentation</span>
      </header>

      {/* Mode toggle */}
      <div className="mode-toggle">
        <button
          className={mode === "single" ? "active" : ""}
          onClick={() => setMode("single")}
        >
          Single Image
        </button>
        <button
          className={mode === "3d" ? "active" : ""}
          onClick={() => setMode("3d")}
        >
          Patient Folder (3D)
        </button>
        <button className="clear-btn" onClick={clearAll}>
          Clear
        </button>
      </div>

      {/* Upload area */}
      <div
        className={`dropzone ${dragActive ? "active" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        ref={dropRef}
      >
        {mode === "single" ? (
          <>
            <input
              type="file"
              id="fileInput"
              accept=".png,.jpg,.jpeg,.tif,.tiff"
              onChange={handleSingleFileChange}
              hidden
            />
            <label htmlFor="fileInput" className="dropzone-label">
              <div className="dropzone-icon">📁</div>
              <p>Drag &amp; drop a single MRI image, or click to browse</p>
              <span className="dropzone-hint">PNG, JPG, JPEG, TIFF</span>
            </label>
            {singleFile && (
              <div className="file-preview-tag">
                <span>📄 {singleFile.name}</span>
                <button
                  className="clear-btn"
                  onClick={() => {
                    setSingleFile(null);
                    setSinglePreview(null);
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <input
              type="file"
              id="folderInput"
              webkitdirectory="true"
              directory="true"
              onChange={handleFolderUpload}
              hidden
            />
            <label htmlFor="folderInput" className="dropzone-label">
              <div className="dropzone-icon">📂</div>
              <p>Click to select a patient folder (all MRI slices)</p>
              <span className="dropzone-hint">Images sorted by numeric suffix</span>
            </label>
            {sliceFiles.length > 0 && (
              <div className="file-preview-tag">
                <span>📂 {sliceFiles.length} slices loaded</span>
                <button
                  className="clear-btn"
                  onClick={() => {
                    setSliceFiles([]);
                    setSlicePreviews([]);
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action button */}
      <button
        className="inference-btn"
        onClick={runInference}
        disabled={
          loading ||
          (mode === "single" && !singleFile) ||
          (mode === "3d" && sliceFiles.length === 0)
        }
      >
        {loading ? (
          <span className="spinner"></span>
        ) : mode === "single" ? (
          "🔍 Analyze MRI"
        ) : (
          "🔬 Reconstruct 3D Volume"
        )}
      </button>

      {/* Image panels for single mode */}
      {mode === "single" && (singlePreview || overlay) && (
        <div className="image-panels">
          {singlePreview && (
            <div className="panel">
              <h3>📷 Original MRI</h3>
              <div className="image-container">
                <img src={singlePreview} alt="Original MRI" />
              </div>
            </div>
          )}
          {overlay && (
            <div className="panel">
              <h3>🩻 Tumor Overlay</h3>
              <div className="image-container">
                <img src={overlay} alt="Segmentation Overlay" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Slice preview grid for 3D mode */}
      {mode === "3d" && slicePreviews.length > 0 && (
        <div className="slice-grid">
          <h3>Slice Preview ({slicePreviews.length} slices)</h3>
          <div className="grid-container">
            {slicePreviews.map((url, idx) => (
              <div key={idx} className="slice-thumb">
                <img src={url} alt={`Slice ${idx + 1}`} />
                <span>#{idx + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results dashboard */}
      {result && (
        <div className="results-dashboard">
          {mode === "single" && (
            <>
              <div className="card">
                <span className="card-label">Tumor Probability</span>
                <span className="card-value highlight">
                  {(result.tumorProbability * 100).toFixed(1)}%
                </span>
              </div>
              <div className="card">
                <span className="card-label">Classifier</span>
                <span
                  className={`card-value ${result.classifierPrediction ? "danger" : "safe"}`}
                >
                  {result.classifierPrediction ? "POSITIVE" : "NEGATIVE"}
                </span>
              </div>
              <div className="card">
                <span className="card-label">Visible Tumor</span>
                <span
                  className={`card-value ${result.visibleTumor ? "danger" : "safe"}`}
                >
                  {result.visibleTumor ? "YES" : "NO"}
                </span>
              </div>
              <div className="card">
                <span className="card-label">Visible Pixels</span>
                <span className="card-value">{result.visiblePixels}</span>
              </div>
            </>
          )}
          {mode === "3d" && (
            <>
              <div className="card">
                <span className="card-label">Slices Processed</span>
                <span className="card-value">{result.sliceCount}</span>
              </div>
              <div className="card">
                <span className="card-label">Tumor‑Positive Slices</span>
                <span className={`card-value ${result.tumorSlices > 0 ? "danger" : "safe"}`}>
                  {result.tumorSlices}
                </span>
              </div>
              <div className="card">
                <span className="card-label">3D Reconstruction</span>
                <span className={`card-value ${result.tumorSlices > 0 ? "success" : "safe"}`}>
                  {result.tumorSlices > 0 ? "✅ Available" : "No tumor"}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* STL download button */}
      {stlData && (
        <button className="download-btn" onClick={downloadSTL}>
          ⬇️ Download Tumor 3D Model (STL)
        </button>
      )}
    </div>
  );
}

export default App;
