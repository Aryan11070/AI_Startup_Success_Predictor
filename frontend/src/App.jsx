import React, { useState, useRef } from 'react';

function App() {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  
  const fileInputRef = useRef(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      handleFileSelection(droppedFile);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = (selectedFile) => {
    // Validate extension
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      setError("Please upload a .csv, .xlsx, or .xls file.");
      setFile(null);
      return;
    }
    setError(null);
    setFile(selectedFile);
    setResults(null); 
  };

  const handlePredict = async () => {
    if (!file) return;

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://127.0.0.1:8000/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Prediction request failed.");
      }

      const data = await response.json();
      setResults(data.predictions);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>StartupVantage AI</h1>
        <p>Predicting startup success and forecasting funding using advanced mathematical modeling.</p>
      </header>

      <div className="upload-wrapper glass-panel">
        <div 
          className={`upload-box ${isDragging ? 'drag-active' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="upload-icon">📄</div>
          <h3>Drag & Drop your dataset</h3>
          <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>
            or click to browse (.csv, .xlsx)
          </p>
          <input 
            type="file" 
            className="file-input" 
            ref={fileInputRef}
            onChange={handleFileInput}
            accept=".csv, .xlsx, .xls"
          />
        </div>

        <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Need a sample dataset?{' '}
          <a href="/startup_dataset_template.xlsx" download="startup_dataset_template.xlsx" style={{ color: '#60a5fa', textDecoration: 'underline', fontWeight: '500' }}>
            Download Excel Template
          </a>
        </div>

        {file && (
          <div style={{ textAlign: 'center' }}>
            <div className="file-info">Selected: {file.name}</div>
            <button 
              className="upload-btn glass-panel" 
              onClick={handlePredict}
              disabled={isLoading}
            >
              {isLoading ? <div className="loader"></div> : 'Analyze Startups ✨'}
            </button>
          </div>
        )}

        {error && (
          <div style={{ color: '#fca5a5', textAlign: 'center', marginTop: '20px', padding: '10px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
            {error}
          </div>
        )}
      </div>

      {results && (
        <div className="results-section">
          <div className="results-header">
            <h2>Analysis Results</h2>
            <span style={{color: 'var(--text-muted)'}}>Analyzed {results.length} startups</span>
          </div>
          
          <div className="results-grid">
            {results.map((item, idx) => {
              const isRisky = item.predicted_status_label === 'Closed';
              
              return (
                <div key={idx} className="startup-card glass-panel">
                  <div className="card-header">
                    <div className="startup-id">Row #{item.row + 1}</div>
                    <div className={`risk-badge ${isRisky ? 'risk-high' : 'risk-low'}`}>
                      {isRisky ? 'High Risk' : 'Low Risk'}
                    </div>
                  </div>
                  
                  <div className="card-details">
                    <div className="detail-row">
                      <span className="detail-label">Status Forecast</span>
                      <span className="detail-value">{item.predicted_status_label}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Expected Funding</span>
                      <span className="funding-value">{formatCurrency(item.forecasted_total_funding)}</span>
                    </div>
                    
                    {/* Just displaying a few input fields contextually */}
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '8px 0' }}></div>
                    
                    <div className="detail-row">
                      <span className="detail-label">Market</span>
                      <span className="detail-value">{item.input.market || item.input.category_list || 'Unknown'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Country</span>
                      <span className="detail-value">{item.input.country_code || 'USA'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Rounds</span>
                      <span className="detail-value">{item.input.funding_rounds}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
