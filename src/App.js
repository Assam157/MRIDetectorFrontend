 import React, { useState, useRef } from "react";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stlData, setStlData] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const dropRef = useRef(null);

  const handleFile = (fileObj) => {
    setFile(fileObj);
    setPreview(URL.createObjectURL(fileObj));
    setOverlay(null);
    setResult(null);
    setStlData(null);
  };

  const handleFileChange = (e) => {
    const img = e.target.files?.[0];
    if (img) handleFile(img);
  };

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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const runInference = async () => {
    if (!file) {
      alert("Please upload an MRI image first.");
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append("image", file);

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
  };

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

  return (
    <div className="app">
      {/* ---- HEADER ---- */}
      <header className="header">
        <div className="header-left">
          <span className="logo">🧠</span>
          <h1>MRI Tumor Detector</h1>
        </div>
        <span className="header-subtitle">AI‑powered hybrid segmentation</span>
      </header>

      {/* ---- UPLOAD AREA ---- */}
      <div
        className={`dropzone ${dragActive ? "active" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        ref={dropRef}
      >
        <input
          type="file"
          id="fileInput"
          accept=".png,.jpg,.jpeg"
          onChange={handleFileChange}
          hidden
        />
        <label htmlFor="fileInput" className="dropzone-label">
          <div className="dropzone-icon">📁</div>
          <p>Drag &amp; drop an MRI image here, or click to browse</p>
          <span className="dropzone-hint">PNG, JPG, JPEG</span>
        </label>
        {file && (
          <div className="file-preview-tag">
            <span>📄 {file.name}</span>
            <button
              className="clear-btn"
              onClick={() => {
                setFile(null);
                setPreview(null);
              }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ---- ACTION BUTTON ---- */}
      <button
        className="inference-btn"
        onClick={runInference}
        disabled={!file || loading}
      >
        {loading ? (
          <span className="spinner"></span>
        ) : (
          "🔍 Analyze MRI"
        )}
      </button>

      {/* ---- IMAGE PANELS ---- */}
      {(preview || overlay) && (
        <div className="image-panels">
          {preview && (
            <div className="panel">
              <h3>📷 Original MRI</h3>
              <div className="image-container">
                <img src={preview} alt="Original MRI" />
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

      {/* ---- RESULTS DASHBOARD ---- */}
      {result && (
        <div className="results-dashboard">
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
        </div>
      )}

      {/* ---- STL DOWNLOAD ---- */}
      {stlData && (
        <button className="download-btn" onClick={downloadSTL}>
          ⬇️ Download Tumor 3D Model (STL)
        </button>
      )}
    </div>
  );
}

export default App;
