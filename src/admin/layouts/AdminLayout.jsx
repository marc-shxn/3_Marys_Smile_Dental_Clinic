import { useEffect, useState } from 'react';
import { loadAdminActivity, loadAdminSession, signOutAdmin, updateAdminPassword, updateAdminProfile } from '../adminAuth.js';
import './AdminLayout.css';
const nav=[['Overview','overview'],['Schedule','schedule'],['Patients','patients'],['Messages','messages'],['Billing','billing'],['Reports','reports']];

function NavIcon({ name }) {
 const common={viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true};
 const paths={
  overview:<><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
  schedule:<><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 14.5l2.2 2.2 4.8-4.8"/></>,
  patients:<><circle cx="9" cy="8" r="3.2"/><path d="M2.8 20v-1.4a5.2 5.2 0 0 1 5.2-5.2h2a5.2 5.2 0 0 1 5.2 5.2V20M16 4.9a3.2 3.2 0 0 1 0 6.2M18 14a4.5 4.5 0 0 1 3.2 4.3V20"/></>,
  messages:<><path d="M5 4.5h14A3.5 3.5 0 0 1 22.5 8v6A3.5 3.5 0 0 1 19 17.5h-8l-6 3v-3A3.5 3.5 0 0 1 1.5 14V8A3.5 3.5 0 0 1 5 4.5Z"/><path d="M7 9h10M7 13h6"/></>,
  billing:<><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9.5h17M7.5 14.5h3"/><circle cx="16.5" cy="15.5" r="2.6"/><path d="M16.5 14.2v2.6m.8-2h-1.1a.6.6 0 0 0 0 1.2h.6a.6.6 0 0 1 0 1.2h-1.1"/></>,
  reports:<><path d="M3.5 20.5h17M5.5 17v-5M10 17V7M14.5 17v-8M19 17V4"/><path d="m4.5 9 5-3 4.5 1.5 5-4"/></>
 };
 return <svg {...common}>{paths[name]}</svg>;
}

function HeaderIcon({ name }) {
 const common={viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true};
 const paths={menu:<><path d="M4 6h16M4 12h16M4 18h16"/></>,bell:<><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,chevron:<path d="m7 10 5 5 5-5"/>};
 return <svg {...common}>{paths[name]}</svg>;
}

function NotificationItemIcon({ title = '', empty = false }) {
 const label = String(title || '').toLocaleLowerCase();
 const icon = empty ? 'bell' : /profile|patient/.test(label) ? 'profile' : /goal|payment|billing|invoice/.test(label) ? 'payment' : /confirm|resched|appointment|reminder/.test(label) ? 'appointment' : 'update';
 const common={viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true};
 const paths={
  appointment:<><rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16M8 14l2.2 2.2 5-5"/></>,
  profile:<><circle cx="12" cy="8" r="3.2"/><path d="M5 20v-1.2a7 7 0 0 1 14 0V20"/></>,
  payment:<><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9h17M8 14h3"/></>,
  update:<><circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5l3 1.8"/></>,
  bell:<><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>
 };
 return <span className={`notification-item-icon is-${icon}`}><svg {...common}>{paths[icon]}</svg></span>;
}

function notificationAge(createdAt) {
 if (!createdAt) return '';
 const timestamp = new Date(createdAt).getTime();
 if (!Number.isFinite(timestamp)) return '';
 const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
 if (minutes < 1) return 'Just now';
 if (minutes < 60) return `${minutes}m ago`;
 const hours = Math.floor(minutes / 60);
 if (hours < 24) return `${hours}h ago`;
 const days = Math.floor(hours / 24);
 return days < 7 ? `${days}d ago` : new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function notificationDestination(item) {
 const signal = `${item?.type || ''} ${item?.title || ''} ${item?.message || ''}`
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ');
 if (/\b(message|messages|chat|conversation)\b/.test(signal)) return 'Messages';
 if (/\b(appointment|schedule|visit|reminder)\b/.test(signal)) return 'Schedule';
 if (/\b(patient|patients|profile)\b/.test(signal)) return 'Patients';
 if (/\b(billing|payment|invoice|goal)\b/.test(signal)) return 'Billing';
 if (/\breport\b/.test(signal)) return 'Reports';
 return 'Notifications';
}

const ADMIN_PHOTO_KEY = 'smile-clinic-admin-photo';
const DEFAULT_ADMIN_PROFILE = { name: 'Clinic Administrator', email: '', phone: '', photo: '/doctora.jpg' };
function readAdminProfile() {
 try { return { ...DEFAULT_ADMIN_PROFILE, photo: localStorage.getItem(ADMIN_PHOTO_KEY) || DEFAULT_ADMIN_PROFILE.photo }; }
 catch { return DEFAULT_ADMIN_PROFILE; }
}
function initials(name) { return String(name || 'R').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'R'; }

function PasswordVisibilityButton({ visible, onClick, label }) {
 return <button className="admin-password-visibility" type="button" onClick={onClick} aria-label={`${visible ? 'Hide' : 'Show'} ${label}`} aria-pressed={visible}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
   {visible ? <><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.4 4.3 9.5 6-.4.7-1.2 1.8-2.4 2.8M6.2 6.2C4.1 7.4 2.9 9.1 2.5 11c1.1 1.7 4.5 6 9.5 6 1 0 2-.2 2.9-.5"/></> : <><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>}
  </svg>
 </button>;
}

export default function AdminLayout({activePage,breadcrumbSubpage='',onNavigate,children,notifications=[],unreadMessages=0,onMarkNotificationsRead,onClearReadNotifications,onMarkNotificationRead,onOpenMessageNotification}){
 const [mobileOpen,setMobileOpen]=useState(false);
 const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
 const [notificationsOpen,setNotificationsOpen]=useState(false);
 const [profileOpen,setProfileOpen]=useState(false);
 const [adminProfile,setAdminProfile]=useState(readAdminProfile);
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [settingsDraft,setSettingsDraft]=useState(adminProfile);
 const [passwordDraft,setPasswordDraft]=useState({current:'',password:'',confirm:''});
 const [passwordVisibility,setPasswordVisibility]=useState({current:false,password:false,confirm:false});
 const [settingsNotice,setSettingsNotice]=useState('');
 const [passwordNotice,setPasswordNotice]=useState('');
 const [settingsError,setSettingsError]=useState('');
 const [adminActivity,setAdminActivity]=useState([]);
 const notificationItems=Array.isArray(notifications)?notifications:[];
 const unreadNotifications=notificationItems.filter(item=>!item.read&&!item.archived).length;
 useEffect(()=>{
  let active=true;
  loadAdminSession().then(admin=>{if(active)setAdminProfile(current=>({...current,...admin,photo:current.photo}));}).catch(()=>{});
  return()=>{active=false;};
 },[]);
 function toggleNotifications(){
  const opening=!notificationsOpen;
  setNotificationsOpen(opening);
  setProfileOpen(false);
 }
 function go(page){onNavigate(page);setMobileOpen(false);setNotificationsOpen(false);setProfileOpen(false)}
 function openNotification(item){
  const destination=notificationDestination(item);
  if(!item.read)void Promise.resolve(onMarkNotificationRead?.(item.id)).catch(()=>{});
  if(destination==='Messages'&&onOpenMessageNotification)onOpenMessageNotification(item);
  else go(destination);
  setNotificationsOpen(false);setProfileOpen(false);setMobileOpen(false);
 }
 function openSettings(){setSettingsDraft(adminProfile);setSettingsOpen(true);setProfileOpen(false);setSettingsNotice('');setPasswordNotice('');setSettingsError('');setPasswordDraft({current:'',password:'',confirm:''});setPasswordVisibility({current:false,password:false,confirm:false});loadAdminActivity().then(result=>setAdminActivity(result.activities||[])).catch(()=>setAdminActivity([]));}
 async function saveProfile(event){
  event.preventDefault();
  const next={...settingsDraft,name:settingsDraft.name.trim(),email:settingsDraft.email.trim(),phone:settingsDraft.phone.trim()};
  if(!next.name||!next.email){setSettingsError('Complete the name and email fields before saving.');return;}
  try{
   const {admin}=await updateAdminProfile({name:next.name,email:next.email,phone:next.phone});
   setAdminProfile(current=>({...current,...admin,photo:next.photo}));setSettingsDraft(current=>({...current,...admin,photo:next.photo}));setSettingsError('');
   try{localStorage.setItem(ADMIN_PHOTO_KEY,next.photo);}catch(storageError){console.warn('Admin profile photo could not be cached:',storageError.message);}
   setSettingsNotice('Admin account details saved.');
  }catch(error){setSettingsError(error.message||'Admin account details could not be saved.');}
 }
 async function saveAdminPassword(event){
  event.preventDefault();setPasswordNotice('');
  if(passwordDraft.password.length<12){setPasswordNotice('Use at least 12 characters for the new password.');return;}
  if(passwordDraft.password!==passwordDraft.confirm){setPasswordNotice('The passwords do not match.');return;}
  try{
   await updateAdminPassword({currentPassword:passwordDraft.current,newPassword:passwordDraft.password});
   setPasswordDraft({current:'',password:'',confirm:''});setPasswordVisibility({current:false,password:false,confirm:false});setPasswordNotice('Password updated. Other signed-in devices have been signed out.');
  }catch(error){setPasswordNotice(error.message||'The password could not be updated.');}
 }
 function handleAdminPhoto(event){
  const file=event.target.files?.[0];if(!file)return;
  if(!file.type.startsWith('image/')){setSettingsError('Choose an image file for the profile photo.');return;}
  if(file.size>2*1024*1024){setSettingsError('Choose a photo smaller than 2 MB.');return;}
  const reader=new FileReader();reader.onload=()=>{setSettingsDraft(current=>({...current,photo:String(reader.result||'')}));setSettingsError('');};reader.onerror=()=>setSettingsError('The selected photo could not be loaded.');reader.readAsDataURL(file);
 }
 async function logOutAdmin(){await signOutAdmin();setProfileOpen(false);setSettingsOpen(false);window.location.assign('/');}
 function toggleNavigation(){
  if(window.matchMedia('(max-width: 650px)').matches)setMobileOpen(value=>!value);
  else setSidebarCollapsed(value=>!value);
 }
 return <div className={`app-shell ${sidebarCollapsed?'sidebar-collapsed':''} ${activePage==='Billing'?'billing-view':''} ${activePage==='Messages'?'messages-view':''}`}>
  <header className="topbar">
   <button className="header-control menu-control mobile-menu-control" onClick={toggleNavigation} aria-label={mobileOpen?'Close navigation':sidebarCollapsed?'Open navigation':'Toggle navigation'} aria-controls="clinic-sidebar" aria-expanded={window.matchMedia('(max-width: 650px)').matches?mobileOpen:!sidebarCollapsed}><HeaderIcon name="menu"/></button>
   <div className="crumb">Clinic workspace <span>/</span> {activePage==='Billing'?<>{breadcrumbSubpage?<>Billing <span>/</span> <b>{breadcrumbSubpage}</b></>:<b>Billing</b>}</>:<b>{activePage}</b>}</div>
   <div className="top-actions">
    <div className="header-popover-anchor"><button className={`header-control notification-control ${notificationsOpen?'active':''}`} onClick={toggleNotifications} aria-label={unreadNotifications?`Notifications, ${unreadNotifications} unread`:'Notifications'} aria-expanded={notificationsOpen}><HeaderIcon name="bell"/>{unreadNotifications>0&&<span className="notification-count-badge" aria-hidden="true">{unreadNotifications>99?'99+':unreadNotifications}</span>}</button>{notificationsOpen&&<div className="header-popover notification-popover">
     <div className="notification-popover-header"><strong>Recent Notifications</strong><div className="notification-popover-actions"><button type="button" onClick={()=>onMarkNotificationsRead?.()}>Mark All as Read</button>{notificationItems.length>0&&<button type="button" onClick={()=>onClearReadNotifications?.()}>Clear Read</button>}</div></div>
     {notificationItems.length?<ul>{notificationItems.slice(0,4).map(item=><li className={item.read?'is-read':'is-unread'} key={item.id}><button className="notification-item-button" type="button" onClick={()=>openNotification(item)} aria-label={`${item.title||'Clinic update'}: ${item.message||'Open related section'}`}><NotificationItemIcon title={item.title}/><span className="notification-item-copy"><strong>{item.title||'Clinic update'}</strong><span>{item.message}</span></span><time>{notificationAge(item.createdAt)}</time></button></li>)}</ul>:<div className="notification-empty"><NotificationItemIcon empty/><p>No new notifications right now.</p></div>}
     <button className="notification-popover-footer" type="button" onClick={()=>go('Notifications')}>View All Notifications</button>
    </div>}</div>
    <div className="header-popover-anchor"><button className={`profile ${profileOpen?'active':''}`} onClick={()=>{setProfileOpen(value=>!value);setNotificationsOpen(false)}} aria-label="Admin account menu" aria-expanded={profileOpen}>{adminProfile.photo?<img className="admin-profile-photo" src={adminProfile.photo} alt=""/>:<span>{initials(adminProfile.name)}</span>}</button>{profileOpen&&<div className="header-popover profile-popover"><span className="profile-popover-avatar">{adminProfile.photo?<img src={adminProfile.photo} alt=""/>:initials(adminProfile.name)}</span><div><b>{adminProfile.name}</b><small>Clinic administrator</small></div><button className="profile-menu-action" onClick={openSettings}>Account settings</button><button className="profile-menu-action" onClick={logOutAdmin}>Log out</button></div>}</div>
   </div>
  </header>
  {mobileOpen&&<button className="drawer-scrim" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>}
  <aside id="clinic-sidebar" className={'sidebar '+(mobileOpen?'open':'')}>
   <div className="sidebar-top">
    <button className="sidebar-brand" onClick={()=>go('Overview')} aria-label="Go to overview"><span className="sidebar-brand-mark"><img src="/marys-smile-gold.png" alt="" /></span><span className="sidebar-brand-copy"><b>3 Mary’s Smile</b><small>Dental Clinic</small></span></button>
    <button className="header-control menu-control sidebar-menu-control" onClick={toggleNavigation} aria-label={sidebarCollapsed?'Expand navigation':'Collapse navigation'} aria-controls="clinic-sidebar" aria-expanded={!sidebarCollapsed}><HeaderIcon name="menu"/></button>
   </div>
   <small className="nav-label">CLINIC WORKSPACE</small><nav aria-label="Clinic workspace">{nav.map(([name,icon])=><button key={name} title={sidebarCollapsed?name:undefined} aria-label={name==='Messages'&&unreadMessages?`${name}, ${unreadMessages} unread`:name} className={'nav-item '+(activePage===name?'active':'')} onClick={()=>go(name)}><span className="nav-icon"><NavIcon name={icon}/></span><span className="nav-item-label">{name}</span>{name==='Messages'&&unreadMessages>0&&<span className="nav-unread-badge">{unreadMessages>9?'9+':unreadMessages}</span>}{activePage===name&&<i/>}</button>)}</nav>
  </aside>
  <main className="main"><div className="page">{children}</div><footer>3 Mary's Smile Dental Clinic <span>•</span> Clinic workspace</footer></main>
  <nav className="mobile-tabs" aria-label="Main navigation">{nav.map(([name,icon])=><button key={name} className={activePage===name?'active':''} onClick={()=>go(name)}><span><NavIcon name={icon}/>{name==='Messages'&&unreadMessages>0&&<i className="mobile-unread-badge">{unreadMessages>9?'9+':unreadMessages}</i>}</span>{name}</button>)}</nav>
  {settingsOpen&&<div className="admin-settings-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setSettingsOpen(false)}}><section className="admin-settings-modal" role="dialog" aria-modal="true" aria-labelledby="admin-settings-title"><header className="admin-settings-heading"><div><span>ADMIN ACCOUNT</span><h2 id="admin-settings-title">Account settings</h2><p>Edit {adminProfile.name}’s profile and account details.</p></div><button type="button" className="admin-settings-close" aria-label="Close account settings" onClick={()=>setSettingsOpen(false)}>×</button></header><form className="admin-settings-form" onSubmit={saveProfile}><div className="admin-settings-photo-row"><span className="admin-settings-photo">{settingsDraft.photo?<img src={settingsDraft.photo} alt="Admin profile preview"/>:initials(settingsDraft.name)}</span><label className="admin-photo-upload">Change photo<input type="file" accept="image/*" onChange={handleAdminPhoto}/></label><small>Use a JPG, PNG, or WebP image up to 2 MB.</small></div><div className="admin-settings-fields"><label>Full name<input value={settingsDraft.name} onChange={event=>setSettingsDraft(current=>({...current,name:event.target.value}))} autoComplete="name" required/></label><label>Email address<input type="email" value={settingsDraft.email} onChange={event=>setSettingsDraft(current=>({...current,email:event.target.value}))} autoComplete="email" required/></label><label>Phone number<input type="tel" value={settingsDraft.phone} onChange={event=>setSettingsDraft(current=>({...current,phone:event.target.value}))} autoComplete="tel"/></label></div>{settingsError&&<p className="admin-settings-message is-error" role="alert">{settingsError}</p>}{settingsNotice&&<p className="admin-settings-message" role="status">{settingsNotice}</p>}<div className="admin-settings-actions"><button className="admin-settings-secondary" type="button" onClick={()=>setSettingsOpen(false)}>Cancel</button><button className="admin-settings-primary" type="submit">Save profile</button></div></form><form className="admin-password-form" onSubmit={saveAdminPassword}>
  <h3>Change password</h3>
  <p>Choose a new password with at least 12 characters.</p>
  <div className="admin-settings-fields">
    <label>Current password<div className="admin-password-input-wrap"><input type={passwordVisibility.current?'text':'password'} autoComplete="current-password" value={passwordDraft.current} onChange={event=>setPasswordDraft(current=>({...current,current:event.target.value}))} required/><PasswordVisibilityButton visible={passwordVisibility.current} onClick={()=>setPasswordVisibility(current=>({...current,current:!current.current}))} label="current password"/></div></label>
    <label>New password<div className="admin-password-input-wrap"><input type={passwordVisibility.password?'text':'password'} autoComplete="new-password" minLength="12" value={passwordDraft.password} onChange={event=>setPasswordDraft(current=>({...current,password:event.target.value}))} required/><PasswordVisibilityButton visible={passwordVisibility.password} onClick={()=>setPasswordVisibility(current=>({...current,password:!current.password}))} label="new password"/></div></label>
    <label>Confirm new password<div className="admin-password-input-wrap"><input type={passwordVisibility.confirm?'text':'password'} autoComplete="new-password" minLength="12" value={passwordDraft.confirm} onChange={event=>setPasswordDraft(current=>({...current,confirm:event.target.value}))} required/><PasswordVisibilityButton visible={passwordVisibility.confirm} onClick={()=>setPasswordVisibility(current=>({...current,confirm:!current.confirm}))} label="password confirmation"/></div></label>
  </div>
  {passwordNotice&&<p className={passwordNotice.includes('updated')?'admin-settings-message':'admin-settings-message is-error'} role="status">{passwordNotice}</p>}
  <button className="admin-settings-primary" type="submit">Update password</button>
</form><section className="admin-activity-section" aria-labelledby="admin-activity-heading"><h3 id="admin-activity-heading">Recent account activity</h3><p>Recent admin actions are logged for security review.</p>{adminActivity.length?<ul>{adminActivity.slice(0,8).map((activity,index)=><li key={`${activity.createdAt}-${index}`}><span>{activity.eventType}</span><time>{new Date(activity.createdAt+'Z').toLocaleString()}</time></li>)}</ul>:<small>Activity will appear here after your next action.</small>}</section></section></div>}
 </div>
}
