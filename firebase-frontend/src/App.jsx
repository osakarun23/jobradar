import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
} from 'firebase/firestore';
import { firebaseConfig } from './firebase-config';
import { generateTailoredCVPDF } from './pdfGenerator';
import './App.css';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [user, setUser] = useState(null);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('cv');
  const [cvs, setCVs] = useState([]);
  const [selectedCV, setSelectedCV] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [tailoredCV, setTailoredCV] = useState('');
  const [tailoredForJob, setTailoredForJob] = useState(null);
  const [applications, setApplications] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [searchJob, setSearchJob] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  const [searchIndustry, setSearchIndustry] = useState('');
  const [searchDaysOld, setSearchDaysOld] = useState('15');
  const [expandedJobs, setExpandedJobs] = useState({});
  const [editingApp, setEditingApp] = useState(null);
  const [pendingJobApplication, setPendingJobApplication] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    applied: 0,
    interviewing: 0,
    rejected: 0,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const fetchCVs = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(collection(db, 'cvs'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      const cvList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setCVs(cvList);
    } catch (err) {
      console.error('Error fetching CVs:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchCVs();
  }, [user, fetchCVs]);

  const fetchApplications = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'applications'),
        where('userId', '==', user.uid)
      );
      const snapshot = await getDocs(q);
      const appList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setApplications(appList);
      setStats({
        total: appList.length,
        applied: appList.filter((a) => a.status === 'applied').length,
        interviewing: appList.filter((a) => a.status === 'interviewing')
          .length,
        rejected: appList.filter((a) => a.status === 'rejected').length,
      });
    } catch (err) {
      console.error('Error fetching applications:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchApplications();
  }, [user, fetchApplications]);

  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    await fetchApplications();
  }, [user, fetchApplications]);

  useEffect(() => {
    fetchDashboardData();
  }, [user, fetchDashboardData]);

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveTab('cv');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;

    try {
      const text = await file.text();
      await addDoc(collection(db, 'cvs'), {
        userId: user.uid,
        fileName: file.name,
        content: text,
        uploadedAt: new Date(),
      });
      setError('');
      fetchCVs();
    } catch (err) {
      setError('Error uploading CV: ' + err.message);
    }
  };

  const handleTailorCV = async () => {
    if (!selectedCV || !jobDescription) {
      setError('Please select a CV and enter a job description');
      return;
    }

    setError('');
    try {
      const cvContent = selectedCV.content;
      const response = await fetch(
        `https://us-central1-jobsearchnk.cloudfunctions.net/tailorCV`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cvContent,
            jobDescription,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to tailor CV. Cloud Functions may not be available.');
      }

      const data = await response.json();
      setTailoredCV(data.tailoredCV);
    } catch (err) {
      setError('Error tailoring CV: ' + err.message);
    }
  };

  const handleDownloadTailoredCV = () => {
    if (!tailoredCV || !tailoredForJob) {
      setError('No tailored CV to download');
      return;
    }

    try {
      generateTailoredCVPDF(
        tailoredCV,
        tailoredForJob.jobTitle,
        tailoredForJob.company
      );
      setError('');
    } catch (err) {
      setError('Error generating PDF: ' + err.message);
    }
  };

  const handleSaveTailoredCV = async () => {
    if (!tailoredCV || !user) {
      setError('No tailored CV to save');
      return;
    }

    try {
      await addDoc(collection(db, 'cvs'), {
        userId: user.uid,
        fileName: `tailored_${selectedCV.fileName}`,
        content: tailoredCV,
        uploadedAt: new Date(),
        isTailored: true,
      });
      setError('');
      setTailoredCV('');
      setTailoredForJob(null);
      fetchCVs();
    } catch (err) {
      setError('Error saving CV: ' + err.message);
    }
  };

  // Filter jobs by date
  const filterJobsByDate = (jobsList) => {
    const daysOld = parseInt(searchDaysOld) || 15;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return jobsList.filter((job) => {
      if (!job.job_posted_at_datetime) return true;
      const jobDate = new Date(job.job_posted_at_datetime);
      return jobDate >= cutoffDate;
    });
  };

  const handleJobSearch = async () => {
    if (!searchJob) {
      setError('Please enter a job title');
      return;
    }

    setError('');
    try {
      let query = `${searchJob}`;
      if (searchLocation) query += ` in ${searchLocation}`;
      if (searchIndustry) query += ` ${searchIndustry}`;

      const response = await fetch(
        `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&page=1&num_pages=1`,
        {
          method: 'GET',
          headers: {
            'x-rapidapi-key': process.env.REACT_APP_JSEARCH_API_KEY,
            'x-rapidapi-host': 'jsearch.p.rapidapi.com',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to search jobs');
      }

      const data = await response.json();
      const filteredJobs = filterJobsByDate(data.data || []);
      setJobs(filteredJobs);

      if (filteredJobs.length === 0) {
        setError(`No jobs found posted in the last ${searchDaysOld} days`);
      }
    } catch (err) {
      setError('Error searching jobs: ' + err.message);
    }
  };

  const handleAutoTailorJob = async (job) => {
    if (!selectedCV) {
      setError('Please select a CV first');
      return;
    }

    setJobDescription(job.job_description);
    setTailoredForJob({ jobTitle: job.job_title, company: job.employer_name });

    // Auto-tailor
    try {
      const cvContent = selectedCV.content;
      const response = await fetch(
        `https://us-central1-jobsearchnk.cloudfunctions.net/tailorCV`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cvContent,
            jobDescription: job.job_description,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to tailor CV');
      }

      const data = await response.json();
      setTailoredCV(data.tailoredCV);

      // Show confirmation dialog
      const confirmed = window.confirm(
        `Ready to apply to ${job.job_title} at ${job.employer_name}?\n\nYour resume has been tailored. Click OK to confirm application and download PDF.`
      );

      if (confirmed) {
        handleDownloadTailoredCV();
        setPendingJobApplication(job);
      }
    } catch (err) {
      setError('Error tailoring CV: ' + err.message);
    }
  };

  const handleConfirmApplication = async () => {
    if (!pendingJobApplication || !user) return;

    try {
      await addDoc(collection(db, 'applications'), {
        userId: user.uid,
        jobTitle: pendingJobApplication.job_title,
        company: pendingJobApplication.employer_name,
        jobUrl: pendingJobApplication.job_apply_link,
        status: 'applied',
        appliedAt: new Date(),
        notes: 'Applied with tailored resume',
      });

      setError('');
      setPendingJobApplication(null);
      setTailoredCV('');
      setTailoredForJob(null);
      setJobDescription('');
      fetchApplications();

      // Show confirmation
      window.alert('Application saved to tracker!');
    } catch (err) {
      setError('Error saving application: ' + err.message);
    }
  };

  const handleApplyJobManual = async (job) => {
    if (!user) {
      setError('Please log in to apply');
      return;
    }

    const confirmed = window.confirm(
      `Apply to ${job.job_title} at ${job.employer_name}?`
    );

    if (confirmed) {
      try {
        await addDoc(collection(db, 'applications'), {
          userId: user.uid,
          jobTitle: job.job_title,
          company: job.employer_name,
          jobUrl: job.job_apply_link,
          status: 'applied',
          appliedAt: new Date(),
          notes: '',
        });
        setError('');
        fetchApplications();
        window.alert('Application saved to tracker!');
      } catch (err) {
        setError('Error saving application: ' + err.message);
      }
    }
  };

  const handleUpdateApplication = async () => {
    if (!editingApp || !user) return;

    try {
      await updateDoc(doc(db, 'applications', editingApp.id), {
        status: editingApp.status,
        notes: editingApp.notes,
      });
      setError('');
      setEditingApp(null);
      fetchApplications();
    } catch (err) {
      setError('Error updating application: ' + err.message);
    }
  };

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <h1>JobRadar</h1>
          <p className="subtitle">
            {isLogin ? 'Sign in to your account' : 'Create a new account'}
          </p>
          <form onSubmit={isLogin ? handleLogin : handleSignUp}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary">
              {isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
          <p className="toggle-auth">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <h1>JobRadar</h1>
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <div className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'cv' ? 'active' : ''}`}
          onClick={() => setActiveTab('cv')}
        >
          Upload CV
        </button>
        <button
          className={`nav-tab ${activeTab === 'jobs' ? 'active' : ''}`}
          onClick={() => setActiveTab('jobs')}
        >
          Job Feed
        </button>
        <button
          className={`nav-tab ${activeTab === 'tracker' ? 'active' : ''}`}
          onClick={() => setActiveTab('tracker')}
        >
          Tracker
        </button>
        <button
          className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
      </div>

      <div className="main-content">
        {error && <p className="error">{error}</p>}

        {activeTab === 'cv' && (
          <div className="tab-content">
            <h2>Upload & Tailor Your CV</h2>
            <div className="cv-section">
              <div className="cv-upload">
                <h3>Upload CV</h3>
                <label className="file-input">
                  <button type="button" className="btn-primary">
                    Choose File
                  </button>
                  <input
                    type="file"
                    accept=".txt,.pdf,.doc,.docx"
                    onChange={handleCVUpload}
                  />
                </label>
                <div className="cv-list">
                  {cvs.map((cv) => (
                    <div
                      key={cv.id}
                      className={`cv-item ${
                        selectedCV?.id === cv.id ? 'selected' : ''
                      }`}
                      onClick={() => setSelectedCV(cv)}
                    >
                      <div>
                        <p>{cv.fileName}</p>
                        <small>
                          {new Date(
                            cv.uploadedAt?.toDate?.()
                          ).toLocaleDateString()}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="cv-tailor">
                <h3>Tailor to Job</h3>
                <textarea
                  placeholder="Paste job description here..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={10}
                />
                <button
                  className="btn-primary"
                  onClick={handleTailorCV}
                  disabled={!selectedCV || !jobDescription}
                >
                  Tailor CV
                </button>
              </div>
            </div>

            {tailoredCV && (
              <div className="tailored-cv-preview">
                <h3>Tailored CV Preview</h3>
                <div className="cv-preview-content">{tailoredCV}</div>
                <div className="action-buttons">
                  <button className="btn-primary" onClick={handleDownloadTailoredCV}>
                    Download as PDF
                  </button>
                  <button className="btn-primary" onClick={handleSaveTailoredCV}>
                    Save CV Version
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setTailoredCV('');
                      setTailoredForJob(null);
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="tab-content">
            <h2>Job Feed</h2>
            <div className="job-search">
              <div className="search-fields">
                <input
                  type="text"
                  placeholder="Job title (e.g., Product Manager)"
                  value={searchJob}
                  onChange={(e) => setSearchJob(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Location"
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Industry (optional)"
                  value={searchIndustry}
                  onChange={(e) => setSearchIndustry(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Days old (default: 15)"
                  value={searchDaysOld}
                  onChange={(e) => setSearchDaysOld(e.target.value)}
                  min="1"
                  max="90"
                />
                <button className="btn-primary" onClick={handleJobSearch}>
                  Search
                </button>
              </div>
            </div>

            {jobs.length > 0 && (
              <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
                Found {jobs.length} jobs
              </p>
            )}

            <div className="jobs-list">
              {jobs.length > 0 ? (
                jobs.map((job, index) => (
                  <div key={index} className="job-card">
                    <div
                      className="job-header"
                      onClick={() =>
                        setExpandedJobs((prev) => ({
                          ...prev,
                          [index]: !prev[index],
                        }))
                      }
                    >
                      <div className="job-title-info">
                        <h3>{job.job_title}</h3>
                        <p className="company">{job.employer_name}</p>
                      </div>
                      <div className="job-meta">
                        <span className="location">
                          {job.job_city}, {job.job_state}
                        </span>
                        {job.job_max_salary && (
                          <span className="salary">
                            ${job.job_min_salary} - ${job.job_max_salary}
                          </span>
                        )}
                      </div>
                    </div>

                    {expandedJobs[index] && (
                      <div className="job-details">
                        <p className="job-description">
                          {job.job_description}
                        </p>
                        <div className="job-actions">
                          <button
                            className="btn-primary"
                            onClick={() => handleAutoTailorJob(job)}
                          >
                            Tailor & Apply
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => handleApplyJobManual(job)}
                          >
                            Quick Apply
                          </button>
                          
                            href={job.job_apply_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary"
                          >
                            View Job
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="no-results">
                  Search for jobs to get started
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tracker' && (
          <div className="tab-content">
            <h2>Application Tracker</h2>
            {pendingJobApplication && (
              <div
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #fbbf24',
                  borderRadius: '6px',
                  padding: '1.5rem',
                  marginBottom: '2rem',
                }}
              >
                <h3 style={{ color: '#fbbf24' }}>
                  Pending: {pendingJobApplication.job_title}
                </h3>
                <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
                  PDF has been downloaded. After applying on the company website, click
                  "Confirm Applied" below.
                </p>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    className="btn-primary"
                    onClick={handleConfirmApplication}
                  >
                    Confirm Applied
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setPendingJobApplication(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="tracker-list">
              {applications.length > 0 ? (
                applications.map((app) => (
                  <div key={app.id} className="tracker-item">
                    {editingApp?.id === app.id ? (
                      <>
                        <div className="tracker-edit">
                          <select
                            className="status-select"
                            value={editingApp.status}
                            onChange={(e) =>
                              setEditingApp({
                                ...editingApp,
                                status: e.target.value,
                              })
                            }
                          >
                            <option value="applied">Applied</option>
                            <option value="interviewing">Interviewing</option>
                            <option value="rejected">Rejected</option>
                            <option value="offer">Offer</option>
                          </select>
                          <textarea
                            className="notes-input"
                            value={editingApp.notes}
                            onChange={(e) =>
                              setEditingApp({
                                ...editingApp,
                                notes: e.target.value,
                              })
                            }
                            placeholder="Add notes..."
                          />
                          <div className="edit-buttons">
                            <button
                              className="btn-primary"
                              onClick={handleUpdateApplication}
                            >
                              Save
                            </button>
                            <button
                              className="btn-secondary"
                              onClick={() => setEditingApp(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="tracker-header">
                          <div className="tracker-job-info">
                            <h4>{app.jobTitle}</h4>
                            <p className="tracker-company">{app.company}</p>
                            <p className="tracker-date">
                              {new Date(
                                app.appliedAt?.toDate?.()
                              ).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="tracker-status">
                            <span
                              className="status-badge"
                              style={{
                                backgroundColor:
                                  app.status === 'applied'
                                    ? '#fbbf24'
                                    : app.status === 'interviewing'
                                      ? '#60a5fa'
                                      : app.status === 'rejected'
                                        ? '#f87171'
                                        : '#4ade80',
                              }}
                            >
                              {app.status}
                            </span>
                            <button
                              className="btn-secondary-small"
                              onClick={() => setEditingApp(app)}
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                        {app.notes && (
                          <p className="notes">{app.notes}</p>
                        )}
                      </>
                    )}
                  </div>
                ))
              ) : (
                <p className="no-applications">
                  No applications yet. Start applying to jobs!
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="tab-content">
            <h2>Dashboard</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div
                  className="stat-indicator"
                  style={{ backgroundColor: '#4ade80' }}
                />
                <div className="stat-content">
                  <p className="stat-label">Total Applications</p>
                  <p className="stat-value">{stats.total}</p>
                </div>
              </div>
              <div className="stat-card">
                <div
                  className="stat-indicator"
                  style={{ backgroundColor: '#fbbf24' }}
                />
                <div className="stat-content">
                  <p className="stat-label">Applied</p>
                  <p className="stat-value">{stats.applied}</p>
                </div>
              </div>
              <div className="stat-card">
                <div
                  className="stat-indicator"
                  style={{ backgroundColor: '#60a5fa' }}
                />
                <div className="stat-content">
                  <p className="stat-label">Interviewing</p>
                  <p className="stat-value">{stats.interviewing}</p>
                </div>
              </div>
              <div className="stat-card">
                <div
                  className="stat-indicator"
                  style={{ backgroundColor: '#f87171' }}
                />
                <div className="stat-content">
                  <p className="stat-label">Rejected</p>
                  <p className="stat-value">{stats.rejected}</p>
                </div>
              </div>
            </div>

            <div className="pipeline-section">
              <h3>Application Pipeline</h3>
              <div className="pipeline-table">
                <div className="table-header">
                  <div className="col-job">Job Title</div>
                  <div className="col-company">Status</div>
                </div>
                {applications.map((app) => (
                  <div key={app.id} className="table-row">
                    <div className="col-job">{app.jobTitle}</div>
                    <div className="col-company">{app.status}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
