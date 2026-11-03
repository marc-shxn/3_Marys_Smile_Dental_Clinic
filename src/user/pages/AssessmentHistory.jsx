import { Fragment, useCallback, useEffect, useState } from 'react';
import { patientPortalApi } from '../../shared/services/clinicApi.js';
import './public-site.css';
import './AiDentalAssessment.css';
import './AssessmentHistory.css';

export default function AssessmentHistory({ navigate }) {
  const [assessments, setAssessments] = useState([]);
  const [expandedAssessmentId, setExpandedAssessmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const loadAssessments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await patientPortalApi.getAssessments();
      setAssessments(result.assessments || []);
    } catch (loadError) {
      setError(loadError.status === 401 ? 'Sign in to view your assessment history.' : loadError.message || 'Your assessment history could not be loaded.');
    } finally { setLoading(false); }
  }, []);

  // The initial table state is already loading; this effect starts the server request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAssessments(); }, [loadAssessments]);

  const go = id => {
    navigate('/');
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  async function deleteAssessment(assessment) {
    if (!window.confirm('Delete this assessment report and its saved photos? This cannot be undone.')) return;
    setDeletingId(assessment.id);
    setActionMessage('');
    try {
      await patientPortalApi.deleteAssessment(assessment.id);
      setAssessments(current => current.filter(item => item.id !== assessment.id));
      if (expandedAssessmentId === assessment.id) setExpandedAssessmentId('');
      setActionMessage('Assessment report and saved photos deleted.');
    } catch (deleteError) {
      setActionMessage(deleteError.message || 'The assessment could not be deleted.');
    } finally { setDeletingId(''); }
  }

  return <main className="public-site ai-assessment-page assessment-history-page">
    <header className="history-page-nav">
      <a href="/" className="public-logo" onClick={event => { event.preventDefault(); navigate('/'); }}>
        <img src="/marys-smile-gold.png" alt="Mary’s Smile Dental Clinic logo" />
        <span className="public-brand-name"><b>3 Mary’s Smile</b><small>Dental Clinic</small></span>
      </a>
      <nav aria-label="Main navigation"><button type="button" onClick={() => go('home')}>Home</button><button type="button" onClick={() => go('services')}>Services</button><button type="button" onClick={() => go('about')}>About us</button><button type="button" onClick={() => go('contact')}>Contact</button></nav>
      <button type="button" className="site-button small" onClick={() => navigate('/ai-dental-assessment')}>Back to Assessment</button>
    </header>
    <div className="ai-assessment-wrap">
      <section className="ai-assessment-intro history-page-intro"><div><h1>Assessment History</h1><p>Your saved oral health reports are listed here. Open any report to review its findings and recommendations.</p></div></section>
      {actionMessage && <p className="history-action-message" role="status">{actionMessage}</p>}
      <section className="ai-history-section"><div className="ai-history-table-wrap"><table className="ai-history-table"><thead><tr><th>Assessment Date</th><th>Risk Level</th><th>Detected Findings</th><th>Recommendation Summary</th><th>Status</th><th>Images</th></tr></thead><tbody>
        {loading ? <tr><td colSpan="6"><div className="ai-history-empty"><b>Loading your assessment history…</b></div></td></tr> : error ? <tr><td colSpan="6"><div className="ai-history-empty"><b>Assessment history unavailable</b><p>{error}</p><div className="history-empty-actions">{error.includes('Sign in') && <button type="button" className="ai-primary-button" onClick={() => navigate('/patient-login')}>Log in</button>}<button type="button" className="ai-secondary-button" onClick={() => void loadAssessments()}>Try Again</button></div></div></td></tr> : assessments.length ? assessments.map(assessment => {
          const result = assessment.result || {};
          const findings = result.findings || [];
          const recommendations = result.recommendations || [];
          const risk = result.riskLevel;
          const images = assessment.images || [];
          const isExpanded = expandedAssessmentId === assessment.id;
          return <Fragment key={assessment.id}>
            <tr>
              <td>{new Date(assessment.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</td>
              <td><span className={'history-risk' + (risk ? ' risk-' + risk.toLowerCase() : '')}>{risk ? risk + ' Risk' : 'Not scored'}</span></td>
              <td><div className="history-result">{findings.length ? <ul>{[...new Set(findings.map(item => item.label))].slice(0, 4).map((item, index) => <li key={index}>{item}</li>)}</ul> : result.observations?.length ? <ul>{result.observations.slice(0, 4).map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>{assessment.status === 'awaiting_ai' ? 'Analysis not run' : 'No matching labels detected'}</p>}</div></td>
              <td><div className="history-result">{recommendations.length ? <p>{recommendations.slice(0, 2).join(' ')}</p> : <p>{result.summary || (assessment.status === 'awaiting_ai' ? 'Photos were saved without an AI analysis.' : 'Continue routine preventive care.')}</p>}</div></td>
              <td><span className={'history-status' + (assessment.status === 'failed' ? ' is-error' : '')}>{assessment.status === 'completed' ? 'Saved' : assessment.status === 'failed' ? 'Analysis unavailable' : assessment.status === 'awaiting_ai' ? 'Not analyzed' : assessment.status}</span></td>
              <td><div className="history-row-actions"><div className="history-thumbnails">{images.slice(0, 3).map(image => <img key={image.id} src={image.url || patientPortalApi.assessmentImageUrl(assessment.id, image.id)} alt={image.kind === 'xray' ? 'Dental X-ray: ' + image.fileName : image.angle + ' teeth view: ' + image.fileName} title={image.fileName}/>)}</div><button type="button" className="history-view-report" aria-expanded={isExpanded} onClick={() => setExpandedAssessmentId(isExpanded ? '' : assessment.id)}>{isExpanded ? 'Hide report' : 'View report'}</button><button type="button" className="history-delete-report" disabled={Boolean(deletingId)} onClick={() => void deleteAssessment(assessment)}>{deletingId === assessment.id ? 'Deleting…' : 'Delete'}</button></div></td>
            </tr>
            {isExpanded && <tr className="history-report-row"><td colSpan="6"><section className="history-full-report" aria-label="Saved oral health report">
              <header><div><h3>Oral Health Report</h3><p>Saved {new Date(assessment.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p></div><span className={'history-risk' + (risk ? ' risk-' + risk.toLowerCase() : '')}>{risk ? risk + ' Risk' : 'Not scored'}</span></header>
              {result.riskDescription && <p className="history-risk-description">{result.riskDescription}</p>}
              <div className="history-full-report-grid">
                <section className="ai-result-card"><div className="ai-result-card-heading"><h3>Possible Findings</h3><span>{findings.length}</span></div>{findings.length ? <ul className="ai-finding-list">{findings.map((finding, index) => <li key={`${finding.angle || 'finding'}-${finding.label}-${index}`}><div className="ai-finding-heading"><b>{finding.label}</b><span>{Math.round(Number(finding.confidence || 0) * 100)}% confidence</span></div><small>{finding.angle || 'Uploaded image'}</small>{finding.description && <p>{finding.description}</p>}</li>)}</ul> : <p className="history-report-note">No matching labels were detected in the saved photos.</p>}</section>
                {Array.isArray(result.byAngle) && result.byAngle.length > 0 && <section className="ai-result-card"><div className="ai-result-card-heading"><h3>Findings by Uploaded View</h3></div>{result.byAngle.map((angle, index) => <div className="ai-angle-result" key={`${angle.angle}-${index}`}><b>{angle.angle || 'Uploaded image'}</b>{angle.findings?.length ? <ul>{angle.findings.map((finding, findingIndex) => <li key={`${finding.label}-${findingIndex}`}>{finding.label}<span>{Math.round(Number(finding.confidence || 0) * 100)}%</span></li>)}</ul> : <small>No matching detections</small>}</div>)}</section>}
                <section className="ai-result-card"><div className="ai-result-card-heading"><h3>Recommendations</h3></div>{recommendations.length ? <ul className="history-report-list">{recommendations.map((recommendation, index) => <li key={index}>{recommendation}</li>)}</ul> : <p className="history-report-note">No recommendations were saved.</p>}</section>
                <section className="ai-result-card"><div className="ai-result-card-heading"><h3>Educational Notes</h3></div>{result.education?.length ? result.education.map((note, index) => <article className="history-education-note" key={`${note.title}-${index}`}><b>{note.title}</b><p>{note.body}</p></article>) : <p className="history-report-note">No educational notes were saved.</p>}</section>
                {images.length > 0 && <section className="ai-result-card history-saved-images"><div className="ai-result-card-heading"><h3>Saved Photos</h3><span>{images.length}</span></div><div className="history-saved-image-grid">{images.map(image => <figure key={image.id}><img src={image.url || patientPortalApi.assessmentImageUrl(assessment.id, image.id)} alt={image.kind === 'xray' ? `Dental X-ray: ${image.fileName}` : `${image.angle || 'Teeth'} view: ${image.fileName}`} /><figcaption>{image.kind === 'xray' ? 'Dental X-ray' : image.angle || 'Teeth view'}<small>{image.fileName}</small></figcaption></figure>)}</div></section>}
              </div>
              {result.model && <p className="history-report-model">Analysis model: {result.model}</p>}
            </section></td></tr>}
          </Fragment>;
        }) : <tr><td colSpan="6"><div className="ai-history-empty"><span className="ai-history-icon" aria-hidden="true"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 14h3m2 0h3m-8 3h3"/></svg></span><b>No assessment history yet</b><p>After you generate a report and choose Save Assessment, its findings, recommendations, and photos will be available to review here.</p><button type="button" className="ai-primary-button" onClick={() => navigate('/ai-dental-assessment')}>Start an Assessment</button></div></td></tr>}
      </tbody></table></div></section>
      <section className="ai-next-step-card history-next-step"><div><b>Have a dental concern?</b><p>A photo cannot replace an examination. Book a visit to discuss your oral health with the clinic.</p></div><button type="button" className="ai-primary-button" onClick={() => navigate('/book-appointment')}>Book a Dental Appointment</button></section>
      <footer className="ai-report-disclaimer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg><div><b>Important Disclaimer</b><p>AI observations are preliminary educational information from photos. They are not a diagnosis and do not replace a professional dental examination by a licensed dental professional.</p></div></footer>
    </div>
  </main>;
}
