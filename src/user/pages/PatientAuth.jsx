import { useMemo, useState } from 'react';
import { authApi } from '../../shared/services/authApi.js';
import { loadAdminSession, verifyAdminMfa } from '../../admin/adminAuth.js';

const modes = {
  '/login': 'login', '/patient-login': 'login', '/create-account': 'register',
  '/forgot-password': 'forgot', '/reset-link-sent': 'sent', '/reset-password': 'reset', '/verify-email': 'verify', '/email-verified': 'verified',
};
const blankForm = {
  firstName: '', middleName: '', lastName: '', dateOfBirth: '', gender: '',
  email: '', phone: '', address: '', password: '', confirmPassword: '',
};
const isGmailAddress = value => /^[^\s@]+@gmail\.com$/i.test(String(value || '').trim());
const formatPersonName = value => String(value || '').replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, separator, letter) => `${separator}${letter.toUpperCase()}`);
export default function PatientAuth({ route, navigate }) {
  const [form, setForm] = useState(() => ({ ...blankForm, email: new URL(route, window.location.origin).searchParams.get('email') || localStorage.getItem('patient-login-email') || '' }));
  const [rememberEmail, setRememberEmail] = useState(() => Boolean(localStorage.getItem('patient-login-email')));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [adminChallengeToken, setAdminChallengeToken] = useState('');
  const [adminMfaCode, setAdminMfaCode] = useState('');
  const [resendMessage, setResendMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [devResetCode, setDevResetCode] = useState('');
  const [devVerifyCode, setDevVerifyCode] = useState('');
  const [code, setCode] = useState(['', '', '', '']);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [passwordForSession, setPasswordForSession] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const url = useMemo(() => new URL(route, window.location.origin), [route]);
  const mode = modes[url.pathname] || 'login';
  const emailForReset = url.searchParams.get('email') || '';
  const emailForVerify = url.searchParams.get('email') || '';
  const loginAfterResetPath = '/patient-login?reset=1' + (url.searchParams.get('next') ? '&next=' + encodeURIComponent(url.searchParams.get('next')) : '');
  const update = event => {
    const { name, value } = event.target;
    const nextValue = ['firstName', 'middleName', 'lastName'].includes(name) ? formatPersonName(value) : value;
    setForm(current => ({ ...current, [name]: nextValue }));
  };

  async function logOutAfterPasswordReset() {
    setLogoutError('');
    setLogoutBusy(true);
    try {
      if (hasActiveSession) await authApi.logout();
      setPasswordForSession('');
      setPasswordUpdated(false);
      navigate(loginAfterResetPath);
    } catch (logoutFailure) {
      setLogoutError(logoutFailure.message || 'We could not log you out. Please try again.');
    } finally {
      setLogoutBusy(false);
    }
  }

  async function continueAfterPasswordReset() {
    setLogoutError('');
    setLogoutBusy(true);
    try {
      if (!hasActiveSession) await authApi.login({ email: emailForReset, password: passwordForSession });
      setPasswordForSession('');
      setPasswordUpdated(false);
      navigate('/');
    } catch (loginFailure) {
      setLogoutError(loginFailure.message || 'We could not keep you signed in. Please log in with your new password.');
    } finally {
      setLogoutBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const email = form.email.trim().toLowerCase();
      if (['register', 'forgot'].includes(mode) && !isGmailAddress(email)) throw new Error('Enter a valid Gmail address ending in @gmail.com.');
      if (mode === 'register') {
        const firstName = formatPersonName(form.firstName).trim();
        const middleName = formatPersonName(form.middleName).trim();
        const lastName = formatPersonName(form.lastName).trim();
        if (firstName.length < 2) throw new Error('Enter your first name to continue.');
        if (lastName.length < 2) throw new Error('Enter your last name to continue.');
        if (form.phone.trim() && !/^\+?[\d\s().-]{7,20}$/.test(form.phone.trim())) throw new Error('Enter a valid phone number, or leave it blank.');
        if (form.password.length < 8) throw new Error('Use a password with at least 8 characters.');
        if (form.password !== form.confirmPassword) throw new Error('Your passwords do not match.');
        const result = await authApi.register({ firstName, middleName, lastName, email, phone: form.phone.trim(), password: form.password });
        setDevVerifyCode(result.verificationCode || '');
        setResendMessage(result.verificationSent === false ? 'We could not send the code just now. Use Resend code to try again.' : 'A verification code has been sent to this email address.');
        setCode(['', '', '', '']);
        navigate('/verify-email?email=' + encodeURIComponent(email));
      } else if (mode === 'login') {
        if (adminChallengeToken) {
          await verifyAdminMfa(adminChallengeToken, adminMfaCode);
          navigate('/admin');
          return;
        }
        if (!form.password) throw new Error('Enter your password to continue.');
        if (rememberEmail) localStorage.setItem('patient-login-email', email);
        else localStorage.removeItem('patient-login-email');
        const result = await authApi.login({ email, password: form.password });
        if (result.mfaRequired) {
          setForm(current => ({ ...current, password: '' }));
          setAdminChallengeToken(result.challengeToken);
          setAdminMfaCode('');
          return;
        }
        if (result.admin) {
          await loadAdminSession();
          navigate('/admin');
        } else {
          navigate('/');
        }
      } else if (mode === 'verify') {
        await authApi.verifyEmail({ email: emailForVerify, code: code.join('') });
        navigate('/email-verified?email=' + encodeURIComponent(emailForVerify));
      } else if (mode === 'forgot') {
        const result = await authApi.forgotPassword({ email });
        setDevResetCode(result.resetCode || '');
        navigate('/reset-link-sent?email=' + encodeURIComponent(email) + (url.searchParams.get('next') ? '&next=' + encodeURIComponent(url.searchParams.get('next')) : ''));
      } else if (mode === 'sent') {
        const result = await authApi.verifyResetCode({ email: emailForReset, code: code.join('') });
        navigate('/reset-password?token=' + encodeURIComponent(result.resetToken) + '&email=' + encodeURIComponent(emailForReset) + (url.searchParams.get('next') ? '&next=' + encodeURIComponent(url.searchParams.get('next')) : ''));
      } else if (mode === 'reset') {
        if (form.password !== form.confirmPassword) throw new Error('Your passwords do not match.');
        await authApi.resetPassword({ token: url.searchParams.get('token'), password: form.password });
        const session = await authApi.session().catch(() => null);
        setHasActiveSession(Boolean(session?.user));
        setPasswordForSession(form.password);
        setForm(current => ({ ...current, password: '', confirmPassword: '' }));
        setLogoutError('');
        setPasswordUpdated(true);
      }
    } catch (err) {
      if (err.code === 'EMAIL_VERIFICATION_REQUIRED') {
        setCode(['', '', '', '']);
        navigate('/verify-email?email=' + encodeURIComponent(emailForVerify || form.email.trim().toLowerCase()));
        return;
      }
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function resendVerification() {
    setError('');
    setBusy(true);
    try {
      const result = await authApi.resendVerification({ email: emailForVerify });
      setDevVerifyCode(result.verificationCode || '');
      setResendMessage(result.verificationSent === false ? 'We could not send the code just now. Try again shortly.' : 'If this account still needs verification, a new code has been sent.');
      setCode(['', '', '', '']);
    } catch (err) {
      setError(err.message || 'We could not resend the code. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function resendCode() {
    setError('');
    setBusy(true);
    try {
      const result = await authApi.forgotPassword({ email: emailForReset });
      setDevResetCode(result.resetCode || '');
      setCode(['', '', '', '']);
    } catch (err) {
      setError(err.message || 'We could not resend the code. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  function changeCode(index, value) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setCode(current => current.map((item, i) => i === index ? digit : item));
    if (digit && index < 3) document.getElementById('reset-code-' + (index + 1))?.focus();
  }
  function pasteCode(event) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted) { event.preventDefault(); setCode([...pasted, '', '', '', ''].slice(0, 4)); }
  }

  const notice = url.searchParams.get('created') ? 'Your account is ready. Sign in to continue.' : url.searchParams.get('reset') ? 'Your password has been updated. Sign in with your new password.' : '';
  const title = adminChallengeToken && mode === 'login' ? 'Verify admin sign in' : mode === 'register' ? 'Create your account' : mode === 'verify' ? 'Verify your email' : mode === 'verified' ? 'Email verified!' : mode === 'forgot' ? 'Forgot your password?' : mode === 'reset' ? 'Create a new password' : mode === 'sent' ? 'Check your email' : 'Patient log in';
  const description = adminChallengeToken && mode === 'login' ? 'Enter the six-digit code from your authenticator app to continue to the clinic dashboard.' : mode === 'register' ? 'Create an account to access your dental care.' : mode === 'verify' ? 'Enter the four-digit code sent to your email address.' : mode === 'verified' ? 'Your email address has been confirmed.' : mode === 'forgot' ? 'Enter the email address linked to your account and we’ll send a reset code.' : mode === 'reset' ? 'Choose a new password for your account.' : mode === 'sent' ? 'Enter the four-digit code sent to your email address.' : 'Patients can sign in for appointments and care. Admins can sign in here to open the clinic dashboard.';
  const cardClass = 'auth-card auth-card-' + mode;
  return <main className={'patient-auth auth-mode-' + mode}>
    <header className="auth-topbar">{mode === 'login' || mode === 'register' ? <button type="button" className="auth-back-top auth-back-action" onClick={() => navigate('/')}><svg className="back-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5M7.5 10H16" /></svg><span>Back to Home</span></button> : mode === 'forgot' || mode === 'sent' || mode === 'reset' ? null : <a className="auth-brand" href="/" onClick={event => { event.preventDefault(); navigate('/'); }}><img src="/clinic-logo.svg" alt="3 Mary’s Smile Dental Clinic" /></a>}{mode === 'forgot' && <button type="button" className="auth-home-link auth-back-action" onClick={() => navigate('/')}><svg className="back-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5M7.5 10H16" /></svg>Back to Home</button>}{(mode === 'sent' || mode === 'reset') && <button type="button" className="auth-home-link auth-back-action" aria-label="Back" onClick={() => navigate(mode === 'sent' ? '/forgot-password?email=' + encodeURIComponent(emailForReset) + (url.searchParams.get('next') ? '&next=' + encodeURIComponent(url.searchParams.get('next')) : '') : '/reset-link-sent?email=' + encodeURIComponent(emailForReset) + (url.searchParams.get('next') ? '&next=' + encodeURIComponent(url.searchParams.get('next')) : ''))}><svg className="back-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5M7.5 10H16" /></svg>Back</button>}{mode !== 'login' && mode !== 'register' && mode !== 'forgot' && mode !== 'sent' && mode !== 'reset' && <div className="auth-top-link"><button type="button" className="back-link auth-back-action" onClick={() => navigate('/patient-login' + (url.searchParams.get('next') ? '?next=' + encodeURIComponent(url.searchParams.get('next')) : ''))}><svg className="back-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5M7.5 10H16" /></svg>Back to log in</button></div>}</header>
    <section className={cardClass}>
      {mode !== 'forgot' && mode !== 'sent' && mode !== 'reset' && <div className="auth-card-brand"><img className="auth-clinic-mark" src="/marys-smile-gold.png" alt="Mary’s Smile Dental Clinic logo" /><span><b>3 Mary’s Smile</b><small>Dental Clinic</small></span></div>}
      {(mode === 'forgot' || mode === 'sent' || mode === 'reset') && <span className="auth-feature-icon">{mode === 'forgot' ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m5 7 7 5.5L19 7"/></svg> : mode === 'sent' ? <svg className="verify-code-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="3" y="5" width="21" height="17" rx="3"/><path d="m4.5 7 9 7 9-7"/><circle cx="21" cy="20" r="5" fill="#eaf9f1"/><path d="m18.8 20 1.5 1.5 2.7-3"/></svg> : <svg className="reset-password-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.5" y="10" width="15" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/><circle cx="12" cy="15" r="1.2"/><path d="M12 16.2v2"/></svg>}</span>}
      <div className="auth-heading"><h1>{title}</h1><p>{description}</p></div>
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {mode === 'verify' ? <form className="auth-form reset-code-form" onSubmit={submit}><p className="reset-email">{emailForVerify}</p><p className="verification-copy">Enter the code we sent to this email address to activate your account.</p><div className="code-inputs" aria-label="Four-digit verification code">{code.map((digit, index) => <input id={'reset-code-' + index} key={index} aria-label={'Code digit ' + (index + 1)} inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} maxLength="1" value={digit} onChange={event => changeCode(index, event.target.value)} onPaste={pasteCode} required />)}</div>{devVerifyCode && <p className="dev-code" role="status">Local demo code: <b>{devVerifyCode}</b></p>}{error && <p className="auth-error" role="alert">{error}</p>}{resendMessage && <p className="prototype-note" role="status">{resendMessage}</p>}<button className="auth-primary" type="submit" disabled={busy || code.some(value => !value)}>{busy ? 'Please wait…' : 'Verify email'}</button><p className="resend-copy">Didn’t receive a code? <button type="button" onClick={resendVerification} disabled={busy}>Resend code</button></p></form> : mode === 'verified' ? <div className="email-flow-screen verified-screen"><span className="verified-icon" aria-hidden="true">✓</span><p className="auth-kicker">EMAIL CONFIRMED</p><h2>Your email is verified</h2><p className="verification-copy">Thanks for confirming <b>{emailForVerify}</b>. Your email address is ready to use.</p><button type="button" className="auth-primary" onClick={() => navigate('/patient-login?verified=1')}>Continue to Login</button></div> : mode === 'sent' ? <form className="auth-form reset-code-form" onSubmit={submit}><p className="reset-email">{emailForReset}</p><div className="code-inputs" aria-label="Four-digit reset code">{code.map((digit, index) => <input id={'reset-code-' + index} key={index} aria-label={'Code digit ' + (index + 1)} inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} maxLength="1" value={digit} onChange={event => changeCode(index, event.target.value)} onPaste={pasteCode} required />)}</div>{devResetCode && <p className="dev-code" role="status">Local demo code: <b>{devResetCode}</b></p>}{error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-primary" type="submit" disabled={busy || code.some(value => !value)}>{busy ? 'Please wait…' : 'Verify code'}</button><p className="resend-copy">Didn’t receive a code? <button type="button" onClick={resendCode} disabled={busy}>Resend code</button></p></form> : <form className="auth-form" onSubmit={submit} noValidate={mode === 'register'}>
        {mode === 'register' && <><label>First Name<input name="firstName" autoComplete="given-name" value={form.firstName} onChange={update} placeholder="Enter your first name" /></label><label>Middle Name (optional)<input name="middleName" autoComplete="additional-name" value={form.middleName} onChange={update} placeholder="Enter your middle name" /></label><label>Last Name<input name="lastName" autoComplete="family-name" value={form.lastName} onChange={update} placeholder="Enter your last name" /></label><label>Email Address<input name="email" type="email" autoComplete="email" value={form.email} onChange={update} placeholder="name@gmail.com" /></label><label>Phone Number (optional)<input name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={update} placeholder="Enter your phone number" /></label><label>Password<div className="password-wrap"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={update} minLength="8" placeholder="At least 8 characters" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></div></label><label>Confirm Password<div className="password-wrap"><input name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={update} minLength="8" placeholder="Re-enter your password" /><button type="button" onClick={() => setShowConfirmPassword(value => !value)} aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>{showConfirmPassword ? 'Hide' : 'Show'}</button></div></label><small className="field-help">Use at least 8 characters. Enter the same password in both fields.</small></>}
        {mode === 'forgot' && <label>Email address<input name="email" type="email" autoComplete="email" value={form.email} onChange={update} placeholder="name@gmail.com" required /></label>}
        {mode === 'login' && (adminChallengeToken ? <><label>Admin authenticator code<input name="adminMfaCode" inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={adminMfaCode} onChange={event => setAdminMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter the six-digit code" required /></label><button type="button" className="text-link" onClick={() => { setAdminChallengeToken(''); setAdminMfaCode(''); setError(''); }}>Back to email and password</button></> : <><label>Email address<input name="email" type="email" autoComplete="email" value={form.email} onChange={update} placeholder="Email address" required /></label><label>Password<div className="password-wrap"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={update} placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></label><div className="auth-options"><label className="remember"><input type="checkbox" checked={rememberEmail} onChange={event => setRememberEmail(event.target.checked)} /> Remember me</label><button type="button" className="text-link" onClick={() => navigate('/forgot-password' + (url.searchParams.get('next') ? '?next=' + encodeURIComponent(url.searchParams.get('next')) : ''))}>Forgot password?</button></div></>))}
        {mode === 'reset' && <><label>New password<div className="password-wrap"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={update} minLength="8" placeholder="At least 8 characters" required /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide new password' : 'Show new password'}>{showPassword ? 'Hide' : 'Show'}</button></div></label><label>Confirm new password<div className="password-wrap"><input name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={update} minLength="8" placeholder="Re-enter your new password" required /><button type="button" onClick={() => setShowConfirmPassword(value => !value)} aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>{showConfirmPassword ? 'Hide' : 'Show'}</button></div></label><small className="field-help">Use at least 8 characters.</small></>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-primary" type="submit" disabled={busy || (mode === 'login' && Boolean(adminChallengeToken) && adminMfaCode.length !== 6)}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset code' : mode === 'reset' ? 'Save new password' : adminChallengeToken ? 'Verify and continue to Admin' : 'Log in'}</button>
        {mode === 'register' && <p className="register-login-copy">Already have an account? <button type="button" onClick={() => navigate('/patient-login' + (url.searchParams.get('next') ? '?next=' + encodeURIComponent(url.searchParams.get('next')) : ''))}>Log in</button></p>}
        {mode === 'register' && <p className="terms-copy">By creating an account, you agree to the clinic’s terms and privacy notice.</p>}
      </form>}
      {mode === 'login' && !adminChallengeToken && <><button type="button" className="auth-secondary login-create" onClick={() => navigate('/create-account' + (url.searchParams.get('next') ? '?next=' + encodeURIComponent(url.searchParams.get('next')) : ''))}>Create account</button></>}
    </section>
    {mode === 'reset' && passwordUpdated && <div className="password-updated-backdrop">
      <section className="password-updated-dialog" role="dialog" aria-modal="true" aria-labelledby="password-updated-title">
        <span className="password-updated-icon" aria-hidden="true">✓</span>
        <p className="auth-kicker">PASSWORD UPDATED</p>
        <h2 id="password-updated-title">Your password is updated</h2>
        <p>Your new password is ready. Choose whether to stay logged in or log out.</p>
        {logoutError && <p className="auth-error" role="alert">{logoutError}</p>}
        <div className="password-updated-actions">
          <><button className="auth-secondary" type="button" onClick={logOutAfterPasswordReset} disabled={logoutBusy}>{logoutBusy ? 'Please wait…' : 'Log out'}</button><button className="auth-primary" type="button" onClick={continueAfterPasswordReset} disabled={logoutBusy}>{logoutBusy ? 'Please wait…' : 'Stay logged in'}</button></>
        </div>
      </section>
    </div>}
    <footer className="auth-footer">© {new Date().getFullYear()} 3 Mary’s Smile Dental Clinic <span>·</span> {adminChallengeToken ? 'Admin access' : mode === 'login' ? 'Patient and admin access' : 'Patient access'}</footer>
  </main>;
}
