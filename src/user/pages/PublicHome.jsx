import { useEffect, useRef, useState } from 'react';
import { authApi } from '../../shared/services/authApi.js';
import { usePatientProfilePhoto } from '../../shared/hooks/usePatientProfilePhoto.js';
import ServicesSection from './ServicesSection.jsx';
import './public-site.css';

function MenuIcon({ name, className = '' }) {
  const paths = {
    profile: <><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.6-3.2 2.8-5 6.5-5s5.9 1.8 6.5 5"/></>,
    security: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1"/><path d="M12 16v2"/></>,
    appointments: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h3m2 0h3"/></>,
    logout: <><path d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10"/><path d="M13 8l4 4-4 4M17 12H9"/></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function PublicHome({ navigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [profilePhoto] = usePatientProfilePhoto(currentUser);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const headerRef = useRef(null);
  useEffect(() => {
    let alive = true;
    authApi.session().then(({ user }) => { if (alive) setCurrentUser(user); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const sections = [...document.querySelectorAll('.public-site > section')];
    sections.forEach(section => section.classList.add('scroll-reveal'));
    if (!('IntersectionObserver' in window)) {
      sections.forEach(section => section.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('is-visible', entry.isIntersecting);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' });
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const closeOnOutside = event => { if (!headerRef.current?.contains(event.target)) setProfileMenuOpen(false); };
    const closeOnEscape = event => { if (event.key === 'Escape') setProfileMenuOpen(false); };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenuOpen]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnOutside = event => {
      const panel = document.getElementById('mobile-nav');
      const toggle = headerRef.current?.querySelector('.menu-toggle');
      if (!panel?.contains(event.target) && !toggle?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = event => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);
  const book = () => {
    setMenuOpen(false);
    navigate('/book-appointment');
  };
  const go = id => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const logIn = () => {
    setMenuOpen(false);
    navigate(currentUser ? '/patient-portal' : '/patient-login');
  };
  const openProfileMenu = () => { setMenuOpen(false); setProfileMenuOpen(open => !open); };
  const closeProfileMenu = () => setProfileMenuOpen(false);
  const logout = async () => {
    setLogoutError('');
    try {
      await authApi.logout();
      setCurrentUser(null);
      closeProfileMenu();
      navigate('/');
    } catch (error) {
      setLogoutError(error.message || 'Could not log out. Please try again.');
    }
  };
  const accountNameParts = currentUser?.fullName?.trim().split(/\s+/) || [];
  const accountInitials = accountNameParts.length > 1 ? (accountNameParts[0][0] + accountNameParts[accountNameParts.length - 1][0]).toUpperCase() : accountNameParts[0]?.[0]?.toUpperCase() || 'P';
  return <main className="public-site">
    <header className="public-nav" ref={headerRef}>
      <a href="/" className="public-logo"><img src="/marys-smile-gold.png" alt="Mary’s Smile Dental Clinic logo" /><span className="public-brand-name"><b>3 Mary’s Smile</b><small>Dental Clinic</small></span></a>
      <nav aria-label="Main navigation"><button type="button" onClick={() => go('home')}>Home</button><button type="button" onClick={() => go('services')}>Services</button><button type="button" onClick={() => go('about')}>About us</button><button type="button" onClick={() => go('contact')}>Contact</button></nav>
      <div className="nav-actions">{currentUser ? <><button type="button" className="site-button small" onClick={book}>Book an appointment</button><button type="button" className="profile-nav" onClick={openProfileMenu} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileMenuOpen}>{profilePhoto ? <img className="profile-photo-image" src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}</button></> : <><button type="button" className="nav-login" onClick={logIn}>Log in</button><button type="button" className="site-button small" onClick={book}>Book an appointment</button></>}</div>
      <button type="button" className={`menu-toggle${menuOpen ? ' is-open' : ''}`} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => { setProfileMenuOpen(false); setMenuOpen(open => !open); }}><span/><span/><span/></button>
      {menuOpen && <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)}/>}
      <div className={`mobile-nav-panel${menuOpen ? ' is-open' : ''}`} id="mobile-nav" aria-hidden={!menuOpen} inert={!menuOpen}>
        <button type="button" onClick={() => go('home')}>Home</button><button type="button" onClick={() => go('services')}>Services</button><button type="button" onClick={() => go('about')}>About us</button><button type="button" onClick={() => go('contact')}>Contact</button>
        <div className="mobile-nav-actions">{currentUser ? <><button type="button" className="site-button small" onClick={book}>Book an appointment</button><button type="button" className="profile-nav" onClick={openProfileMenu} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileMenuOpen}>{profilePhoto ? <img className="profile-photo-image" src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}</button></> : <><button type="button" className="nav-login" onClick={logIn}>Log in</button><button type="button" className="site-button small" onClick={book}>Book an appointment</button></>}</div>
      </div>
      {currentUser && profileMenuOpen && <div className="profile-menu" role="menu" aria-label="Account menu">
        <div className="profile-menu-heading">{profilePhoto ? <img className="profile-menu-photo" src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}<div><b>{currentUser.fullName}</b><small>{currentUser.email}</small></div></div>
        <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { closeProfileMenu(); navigate('/patient-portal'); }}><span className="profile-menu-icon"><MenuIcon name="profile"/></span><span><b>Profile</b><small>View and edit your personal information and profile photo</small></span></button>
        <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { closeProfileMenu(); navigate('/forgot-password?email=' + encodeURIComponent(currentUser.email)); }}><span className="profile-menu-icon"><MenuIcon name="security"/></span><span><b>Security &amp; password</b><small>Change your password, update email, and manage account security</small></span></button>
        <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { closeProfileMenu(); window.dispatchEvent(new Event('open-my-appointments')); }}><span className="profile-menu-icon"><MenuIcon name="appointments"/></span><span><b>My appointments</b><small>View your booked visits and appointment details</small></span></button>
        {logoutError && <p className="profile-logout-error" role="alert">{logoutError}</p>}
        <button type="button" role="menuitem" className="profile-menu-logout" onClick={logout}><MenuIcon name="logout"/>Log out</button>
      </div>}
    </header>
    <section className="public-hero" id="home"><div className="hero-copy"><span className="eyebrow"><i/> 3 MARY’S SMILE DENTAL CLINIC</span><h1>A brighter smile<br/>starts <em>with care.</em></h1><p>Gentle, thoughtful dental care for every smile. Visit 3 Mary’s Smile and feel at home from your very first appointment.</p><div className="hero-actions"><button type="button" className="site-button" onClick={book}>Book your visit</button><button type="button" className="text-button" onClick={() => go('services')}>Dental Services</button></div></div><div className="hero-art"><div className="hero-photo-orbit"/><figure className="hero-photo-frame"><img src="/dentist-team.jpg" alt="Two dentists providing gentle patient care"/></figure></div></section>
    <ServicesSection navigate={navigate} />
    <section className="ai-home-section" id="ai-assessment">
      <div className="ai-home-inner">
        <div className="ai-home-copy">
          <span className="eyebrow"><i/> DIGITAL ORAL HEALTH TOOL</span>
          <h2>Get a helpful first look at your smile.</h2>
          <p>Upload a clear photo of your teeth and mouth to receive preliminary AI-assisted observations and general preventive-care suggestions. Results depend on photo quality and what is visible.</p>
          <p className="ai-home-disclaimer">This tool offers educational guidance only. It does not provide a confirmed diagnosis or replace an examination by a dentist.</p>
          <button type="button" className="site-button" onClick={() => navigate('/ai-dental-assessment')}>Open AI Oral Health Assessment</button>
        </div>
      </div>
    </section>
    <section className="about-band" id="about"><div className="about-art"><figure className="about-doctora-frame"><img src="/doctora.jpg" alt="Dr. Rebeca A. Avena, dentist at 3 Mary’s Smile Dental Clinic"/></figure><p className="about-doctora-name">Dr. Rebeca A. Avena</p></div><div className="about-copy"><h2>About 3 Mary’s Smile Dental Clinic</h2><p>I established 3 Mary’s Smile Dental Clinic in December 2010, and it remains my first and only dental clinic. The name was inspired by my family—I have two sisters, and together we are lovingly called the “Three Marys.”</p><p>What began as a solo dental practice has grown steadily over the years. In 2013, I welcomed my first associate dentist to better serve our growing number of patients.</p><p>Today, we offer a wide range of dental services, including preventive, restorative, esthetic, orthodontic, and oral surgery treatments. We are committed to providing quality, ethical, and compassionate dental care in a comfortable, patient-centered environment.</p><p>Our goal is to help every patient achieve a healthy, confident smile through personalized treatment, modern techniques, and genuine care.</p></div></section>
    <section className="contact-section clinic-info-section" id="contact"><header className="clinic-info-heading"><h2>CLINIC INFO</h2></header><div className="clinic-info-list"><p><b>Clinic Hours</b><span>9 am – 5 pm, Monday - Saturday</span></p><p><b>Address</b><span>#11 Block 01 Gumaok East, San Jose del Monte, Bulacan</span></p><p><b>Contact / Social Media</b><a href="tel:09062408920">0906 240 8920</a><a href="https://www.facebook.com/profile.php?id=100057645602181" target="_blank" rel="noopener noreferrer">3 Mary's Smile Dental Clinic fb page</a></p><p><b>Email</b><a href="mailto:bheca_austria17@yahoo.com">bheca_austria17@yahoo.com</a></p></div><div className="clinic-map-card"><iframe title="Map pinned to 14.799310, 121.068612" src="https://www.google.com/maps?q=14.799310%2C121.068612&z=16&output=embed" loading="lazy" referrerPolicy="no-referrer-when-downgrade"/><a href="https://www.google.com/maps/search/?api=1&query=14.799310%2C121.068612" target="_blank" rel="noreferrer">14.799310, 121.068612 · Open in Google Maps <span aria-hidden="true">↗</span></a></div></section>
    <footer className="public-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <a href="/" className="public-logo"><img src="/marys-smile-gold.png" alt="Mary’s Smile Dental Clinic logo"/><span className="public-brand-name"><b>3 Mary’s Smile</b><small>Dental Clinic</small></span></a>
          <p>Gentle, thoughtful dental care for every smile.</p>
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <b>Explore</b>
          <button type="button" onClick={() => go('home')}>Home</button>
          <button type="button" onClick={() => go('services')}>Dental Services</button>
          <button type="button" onClick={() => go('about')}>About us</button>
          <button type="button" onClick={() => go('contact')}>Clinic Info</button>
        </nav>
        <div className="footer-contact">
          <b>Contact the clinic</b>
          <span>9 am – 5 pm, Monday – Saturday</span>
          <a href="tel:09062408920">0906 240 8920</a>
          <a href="mailto:bheca_austria17@yahoo.com">bheca_austria17@yahoo.com</a>
          <a href="https://www.facebook.com/profile.php?id=100057645602181" target="_blank" rel="noopener noreferrer">3 Mary's Smile Dental Clinic fb page</a>
        </div>
      </div>
      <div className="footer-bottom"><small>© {new Date().getFullYear()} 3 Mary’s Smile Dental Clinic. All rights reserved.</small><span>Quality care, delivered with kindness.</span></div>
    </footer>
    <button className="ai-assessment-fab" type="button" aria-label="Open AI Dental Assessment" title="AI Dental Assessment" onClick={() => navigate('/ai-dental-assessment')}><img src="/whitey-dental-assistant.jpg" alt="" /></button>
  </main>;
}
