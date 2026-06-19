import React, { useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from './firebase-config';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('upload-cv');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="app">
      <header className="header">
        <h1>JobRadar</h1>
        <button 
          className="logout-btn" 
          onClick={() => signOut(auth)}
        >
          Logout
        </button>
      </header>

      <nav className="nav-tabs">
        <button 
          className={`nav-tab ${activeTab === 'upload-cv' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload-cv')}
        >
          📄 Upload CV
        </button>
        <button 
          className={`nav-tab ${activeTab === 'job-feed' ? 'active' : ''}`}
          onClick={() => setActiveTab('job-feed')}
        >
          💼 Job Feed
        </button>
        <button 
          className={`nav-tab ${activeTab === 'tracker' ? 'active' : ''}`}
          onClick={() => setActiveTab('tracker')}
        >
          📊 Tracker
        </button>
        <button 
          className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          📈 Dashboard
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'upload-cv' && <UploadCVTab user={user} />}
        {activeTab === 'job-feed' && <JobFeedTab user={user} />}
        {activeTab === 'tracker' && <TrackerTab user={user} />}
        {activeTab === 'dashboard' && <DashboardTab user={user} />}
      </main>
    </div>
  );
}

function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        setError('Account created! Signed in automatically.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <h1>JobRadar</h1>
        <p className="subtitle">AI-Powered Job Application Management</p>
        
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
          />
          
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        {error && <p className={error.includes('created') ? 'success' : 'error'}>{error}</p>}

        <p className="toggle-auth">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <button 
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="link-btn"
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}

function UploadCVTab({ user }) {
  const [cvs, setCVs] = useState([]);
  const [selectedCV, setSelectedCV] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [tailoredCV, setTailoredCV] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCVs();
  }, [user]);

  const fetchCVs = async () => {
    try {
      const q = query(
        collection(db, 'cvs'),
        where('userId', '==', user.uid),
        orderBy('uploadedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const cvData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCVs(cvData);
    } catch (err) {
      console.error('Error fetching CVs:', err);
    }
  };

  const handleCVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setLoading(true);
      const fileContent = await file.text();

      await addDoc(collection(db, 'cvs'), {
        userId: user.uid,
        filename: file.name,
        content: fileContent,
        uploadedAt: new Date(),
      });

      fetchCVs();
      alert('CV uploaded successfully!');
    } catch (err) {
      console.error('Error uploading CV:', err);
      alert('Error uploading CV');
    } finally {
      setLoading(false);
    }
  };

  const handleTailorCV = async () => {
    if (!selectedCV || !jobDescription) {
      alert('Please select a CV and paste a job description');
      return;
    }

    try {
      setLoading(true);
      
      const cvData = cvs.find(cv => cv.id === selectedCV);
      
      const tailorCVFunction = httpsCallable(functions, 'tailorCV');
      const result = await tailorCVFunction({
        cvContent: cvData.content,
        jobDescription: jobDescription,
      });

      setTailoredCV(result.data.tailoredCV);
    } catch (err) {
      console.error('Error tailoring CV:', err);
      alert('Error tailoring CV. Check Cloud Function logs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content">
      <h2>Upload & Tailor Your CV</h2>

      <div className="cv-section">
        <div className="cv-upload">
          <h3>📄 Your CVs</h3>
          <label className="file-input">
            <span className="btn-secondary">+ Upload CV</span>
            <input 
              type="file" 
              accept=".pdf,.doc,.docx,.txt"
              onChange={handleCVUpload}
              disabled={loading}
            />
          </label>

          {cvs.length > 0 && (
            <div className="cv-list">
              {cvs.map(cv => (
                <div 
                  key={cv.id}
                  className={`cv-item ${selectedCV === cv.id ? 'selected' : ''}`}
                  onClick={() => setSelectedCV(cv.id)}
                >
                  <span>{cv.filename}</span>
                  <small>{new Date(cv.uploadedAt.toDate()).toLocaleDateString()}</small>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cv-tailor">
          <h3>✨ Tailor for Job</h3>
          <textarea
            placeholder="Paste the job description here..."
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={8}
          />
          <button 
            onClick={handleTailorCV}
            className="btn-primary"
            disabled={!selectedCV || !jobDescription || loading}
          >
            {loading ? 'Processing...' : 'Tailor CV with AI'}
          </button>
        </div>
      </div>

      {tailoredCV && (
        <div className="tailored-cv-preview">
          <h3>AI-Tailored CV Preview</h3>
          <div className="cv-preview-content">
            {tailoredCV}
          </div>
          <div className="action-buttons">
            <button 
              className="btn-primary"
              onClick={() => {
                navigator.clipboard.writeText(tailoredCV);
                alert('Copied to clipboard!');
              }}
            >
              ✓ Copy & Approve
            </button>
            <button 
              className="btn-secondary"
              onClick={() => setTailoredCV(null)}
            >
              ✗ Reject & Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function JobFeedTab({ user }) {
  const [jobs, setJobs] = useState([]);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  const handleSearch = async () => {
    if (!query) return;

    try {
      setLoading(true);
      
      const url = new URL('https://jsearch.p.rapidapi.com/search');
      url.searchParams.append('query', query);
      url.searchParams.append('location', location || 'United States');
      url.searchParams.append('page', '1');
      url.searchParams.append('num_pages', '1');

      const response = await fetch(url, {
        headers: {
          'x-rapidapi-key': process.env.REACT_APP_JSEARCH_API_KEY,
          'x-rapidapi-host': 'jsearch.p.rapidapi.com'
        }
      });

      const data = await response.json();
      
      const formattedJobs = (data.data || []).map(job => ({
        id: job.job_id,
        title: job.job_title,
        company: job.employer_name,
        location: job.job_location,
        description: job.job_description,
        salary: job.job_salary_max || job.job_salary_min || 'Not specified',
        jobUrl: job.job_apply_link,
        postDate: job.job_posted_at_datetime_utc,
      }));

      setJobs(formattedJobs);
    } catch (err) {
      console.error('Error searching jobs:', err);
      alert('Error searching jobs. Check your JSearch API key.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveJob = async (job) => {
    try {
      await addDoc(collection(db, 'applications'), {
        userId: user.uid,
        jobId: job.id,
        jobTitle: job.title,
        company: job.company,
        location: job.location,
        jobUrl: job.jobUrl,
        description: job.description,
        status: 'applied',
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      alert(`Saved! Now go to Upload CV to tailor your resume for ${job.title} at ${job.company}`);
    } catch (err) {
      console.error('Error saving job:', err);
    }
  };

  return (
    <div className="tab-content">
      <h2>Job Feed</h2>
      
      <div className="job-search">
        <div className="search-fields">
          <input
            type="text"
            placeholder="Job title, skills, keywords..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <input
            type="text"
            placeholder="Location (city, state)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button 
            onClick={handleSearch}
            className="btn-primary"
            disabled={loading || !query}
          >
            {loading ? 'Searching...' : 'Search Jobs'}
          </button>
        </div>
      </div>

      <div className="jobs-list">
        {jobs.length === 0 && !loading && query && (
          <p className="no-results">No jobs found. Try different keywords.</p>
        )}

        {jobs.map(job => (
          <div 
            key={job.id}
            className={`job-card ${selectedJob?.id === job.id ? 'expanded' : ''}`}
          >
            <div className="job-header" onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}>
              <div className="job-title-info">
                <h3>{job.title}</h3>
                <p className="company">{job.company}</p>
              </div>
              <div className="job-meta">
                <span className="location">📍 {job.location}</span>
                <span className="salary">💰 {job.salary}</span>
              </div>
            </div>

            {selectedJob?.id === job.id && (
              <div className="job-details">
                <div className="job-description">
                  {job.description?.substring(0, 500)}...
                </div>
                <div className="job-actions">
                  <button 
                    className="btn-primary"
                    onClick={() => handleSaveJob(job)}
                  >
                    ✓ Save & Apply
                  </button>
                  <a 
                    href={job.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                  >
                    View on Job Board →
                  </a>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrackerTab({ user }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editStatus, setEditStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    fetchApplications();
  }, [user]);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'applications'),
        where('userId', '==', user.uid),
        orderBy('updatedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const appData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setApplications(appData);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (app) => {
    setEditingId(app.id);
    setEditStatus(app.status);
    setEditNotes(app.notes || '');
  };

  const saveEdit = async (id) => {
    try {
      const appDoc = doc(db, 'applications', id);
      await updateDoc(appDoc, {
        status: editStatus,
        notes: editNotes,
        updatedAt: new Date(),
      });

      fetchApplications();
      setEditingId(null);
    } catch (err) {
      console.error('Error updating application:', err);
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'offer': return '#4ade80';
      case 'interviewing': return '#fbbf24';
      case 'rejected': return '#f87171';
      default: return '#9ca3af';
    }
  };

  return (
    <div className="tab-content">
      <h2>Application Tracker</h2>

      <div className="tracker-list">
        {applications.length === 0 ? (
          <p className="no-applications">No applications yet. Search for jobs and save them!</p>
        ) : (
          applications.map(app => (
            <div key={app.id} className="tracker-item">
              <div className="tracker-header">
                <div className="tracker-job-info">
                  <h4>{app.jobTitle}</h4>
                  <p className="tracker-company">{app.company}</p>
                </div>
                <div className="tracker-date">
                  {new Date(app.createdAt.toDate()).toLocaleDateString()}
                </div>
              </div>

              {editingId === app.id ? (
                <div className="tracker-edit">
                  <select 
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="status-select"
                  >
                    <option value="applied">Applied</option>
                    <option value="interviewing">Interviewing</option>
                    <option value="rejected">Rejected</option>
                    <option value="offer">Offer</option>
                  </select>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Add notes..."
                  />
                  <div className="edit-buttons">
                    <button className="btn-primary" onClick={() => saveEdit(app.id)}>Save</button>
                    <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="tracker-status">
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(app.status) }}
                  >
                    {app.status}
                  </span>
                  {app.notes && <p className="notes">{app.notes}</p>}
                  <button 
                    className="btn-secondary-small"
                    onClick={() => startEdit(app)}
                  >
                    ✏ Edit
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DashboardTab({ user }) {
  const [stats, setStats] = useState(null);
  const [pipeline, setPipeline] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      const q = query(
        collection(db, 'applications'),
        where('userId', '==', user.uid)
      );
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => doc.data());

      const stats = {
        totalApplications: data.length,
        applied: data.filter(d => d.status === 'applied').length,
        interviewing: data.filter(d => d.status === 'interviewing').length,
        rejected: data.filter(d => d.status === 'rejected').length,
        offers: data.filter(d => d.status === 'offer').length,
      };
      setStats(stats);
      setPipeline(data);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  };

  if (!stats) return <div className="tab-content"><p>Loading...</p></div>;

  const successRate = stats.totalApplications > 0 
    ? Math.round((stats.offers / stats.totalApplications) * 100)
    : 0;

  return (
    <div className="tab-content dashboard">
      <h2>Your Application Dashboard</h2>

      <div className="stats-grid">
        <StatCard label="Total Applications" value={stats.totalApplications} color="#9ca3af" />
        <StatCard label="Applied" value={stats.applied} color="#9ca3af" />
        <StatCard label="Interviewing" value={stats.interviewing} color="#fbbf24" />
        <StatCard label="Offers" value={stats.offers} color="#4ade80" />
        <StatCard label="Rejected" value={stats.rejected} color="#f87171" />
        <StatCard label="Success Rate" value={`${successRate}%`} color="#60a5fa" />
      </div>

      <div className="pipeline-section">
        <h3>📊 Pipeline Overview</h3>
        {pipeline.length === 0 ? (
          <p>No applications yet.</p>
        ) : (
          <div className="pipeline-table">
            <div className="table-header">
              <div className="col-job">Job Title</div>
              <div className="col-company">Company</div>
            </div>
            {pipeline.map((item, idx) => (
              <div key={idx} className="table-row">
                <div className="col-job">{item.jobTitle}</div>
                <div className="col-company">{item.company}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="btn-primary" onClick={fetchDashboardData}>
        🔄 Refresh Data
      </button>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="stat-card">
      <div 
        className="stat-indicator"
        style={{ backgroundColor: color }}
      />
      <div className="stat-content">
        <p className="stat-label">{label}</p>
        <h3 className="stat-value">{value}</h3>
      </div>
    </div>
  );
}
