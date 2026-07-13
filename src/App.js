import React, { useState } from "react";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stlData, setStlData] = useState(null);

  const handleFileChange = (e) => {
    const img = e.target.files[0];
    if (!img) return;

    setFile(img);
    setPreview(URL.createObjectURL(img));
    setOverlay(null);
    setResult(null);
    setStlData(null);
  };

  const runInference = async () => {
    if (!file) {
      alert("Upload an MRI image first");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("http://localhost:5000/predict", {
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
      alert("Backend not reachable");
    }

    setLoading(false);
  };

  const downloadSTL = () => {
    if (!stlData) {
      alert("No STL available");
      return;
    }

    const blob = new Blob(
      [Uint8Array.from(atob(stlData), c => c.charCodeAt(0))],
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
      <h1>🧠 Hybrid MRI Tumor Detector</h1>

      <input
        type="file"
        accept=".png,.jpg,.jpeg"
        onChange={handleFileChange}
      />

      <button onClick={runInference} disabled={loading}>
        {loading ? "Processing..." : "Run Inference"}
      </button>

      <div className="images">
        {preview && (
          <div>
            <h3>Original MRI</h3>
            <img src={preview} alt="Original MRI" />
          </div>
        )}

        {overlay && (
          <div>
            <h3>Segmentation Overlay</h3>
            <img src={overlay} alt="Overlay" />
          </div>
        )}
      </div>

      {result && (
        <div className="results">
          <h3>Results</h3>
          <p><b>Tumor Probability:</b> {result.tumorProbability}</p>
          <p>
            <b>Classifier Prediction:</b>{" "}
            {result.classifierPrediction ? "YES" : "NO"}
          </p>
          <p>
            <b>Visible Tumor:</b>{" "}
            {result.visibleTumor ? "YES" : "NO"}
          </p>
          <p><b>Visible Pixels:</b> {result.visiblePixels}</p>
        </div>
      )}

      {stlData && (
        <button onClick={downloadSTL}>
          Download Tumor STL
        </button>
      )}
    </div>
  );
}


export default App;
