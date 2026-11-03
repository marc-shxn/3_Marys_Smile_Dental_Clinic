import { useEffect, useState } from 'react';
import { authenticateAdmin, loadAdminSession, verifyAdminMfa } from '../adminAuth.js';
import '../../shared/styles/auth.css';
import './AdminLogin.css';

export default function AdminLogin({ navigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    loadAdminSession().then(() => { if (active) navigate('/admin'); }).catch(() => {}).finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, [navigate]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (challengeToken) {
        await verifyAdminMfa(challengeToken, mfaCode);
        navigate('/admin');
      } else {
        const result = await authenticateAdmin(email, password);
        if (result.mfaRequired) setChallengeToken(result.challengeToken);
        else navigate('/admin');
      }
    } catch (error) {
      setError(error.message || 'Sign in could not be completed. Please try again.');
    } finally { setSubmitting(false); }
  }

  return <main className="admin-login-page">
    <header className="admin-login-topbar">
      <button className="admin-login-back" type="button" onClick={() => navigate('/')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6M9 12h11"/></svg>
        Back to Home
      </button>
    </header>
    <section className="admin-login-card" aria-labelledby="admin-login-title">
      <div className="admin-login-brand">
        <img src="/marys-smile-gold.png" alt="" />
        <span><strong>3 Mary’s Smile</strong><small>Dental Clinic</small></span>
      </div>
      <p className="admin-login-kicker">CLINIC WORKSPACE</p>
      <h1 id="admin-login-title">Admin sign in</h1>
      <p className="admin-login-intro">{challengeToken ? 'Enter the current six-digit code from your authenticator app.' : 'Sign in to manage the clinic schedule, patient records, and messages.'}</p>
      <form onSubmit={submit} className="admin-login-form">
        {!challengeToken ? <><label>Email address<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label>
        <label>Password<span className="admin-login-password"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></span></label></> : <label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>}
        {error && <p className="admin-login-error" role="alert">{error}</p>}
        <button className="admin-login-submit" type="submit" disabled={submitting || checkingSession || (challengeToken && mfaCode.length !== 6)}>{checkingSession ? 'Checking session…' : submitting ? 'Please wait…' : challengeToken ? 'Verify and sign in' : 'Sign in to Admin'}</button>
        {challengeToken && <button type="button" className="text-link" onClick={() => { setChallengeToken(''); setMfaCode(''); setError(''); }}>Back to password</button>}
      </form>
    </section>
    <footer className="admin-login-footer">© {new Date().getFullYear()} 3 Mary’s Smile Dental Clinic <span>•</span> Admin access</footer>
  </main>;
}
