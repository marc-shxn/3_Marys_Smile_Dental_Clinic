import { useEffect, useMemo, useState } from 'react';
import './Notifications.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
  { id: 'archived', label: 'Archived' },
];

function NotificationIcon({ title = '', variant = '' }) {
  const text = String(title || '').toLocaleLowerCase();
  const icon = variant === 'empty' ? 'bell' : variant === 'unread' ? 'check' : variant === 'read' ? 'info' : variant === 'archived' ? 'archive' : /profile|patient/.test(text) ? 'profile' : /goal|payment|billing|invoice/.test(text) ? 'payment' : /appointment|reminder|confirm|resched/.test(text) ? 'appointment' : 'update';
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    appointment: <><rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16M8 14l2.2 2.2 5-5"/></>,
    profile: <><circle cx="12" cy="8" r="3.2"/><path d="M5 20v-1.2a7 7 0 0 1 14 0V20"/></>,
    payment: <><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9h17M8 14h3"/></>,
    update: <><circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5l3 1.8"/></>,
    check: <><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.3 2.3 4.7-4.8"/></>,
    info: <><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></>,
    archive: <><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6"/></>,
  };
  return <span className={`notifications-page-icon is-${icon}`}><svg {...common}>{paths[icon]}</svg></span>;
}

function ageLabel(value) {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateLabel(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Notifications({
  notifications = [],
  onMarkNotificationsRead,
  onClearReadNotifications,
  onArchiveNotification,
  onRestoreNotification,
  onDeleteNotification,
}) {
  const [filter, setFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteToast, setDeleteToast] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const allItems = Array.isArray(notifications) ? notifications : [];
  const activeItems = allItems.filter(item => !item.archived);
  const unreadCount = activeItems.filter(item => !item.read).length;
  const counts = {
    all: activeItems.length,
    unread: activeItems.filter(item => !item.read).length,
    read: activeItems.filter(item => item.read).length,
    archived: allItems.filter(item => item.archived).length,
  };
  const selectedItems = useMemo(() => {
    const rows = allItems.filter(item => {
      if (filter === 'archived') return Boolean(item.archived);
      if (item.archived) return false;
      if (filter === 'unread') return !item.read;
      if (filter === 'read') return Boolean(item.read);
      return true;
    });
    return rows.sort((a, b) => {
      const aTime = new Date(a.archivedAt || a.createdAt || 0).getTime() || 0;
      const bTime = new Date(b.archivedAt || b.createdAt || 0).getTime() || 0;
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });
  }, [allItems, filter, sortOrder]);

  useEffect(() => {
    if (!deleteToast) return undefined;
    const timeout = window.setTimeout(() => setDeleteToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [deleteToast]);

  async function runAction(action) {
    setActionError('');
    try { await action?.(); }
    catch (error) { setActionError(error.message || 'The notification could not be saved. Please try again.'); }
  }

  async function confirmPermanentDelete() {
    if (!deleteTarget || actionBusy) return;
    setActionBusy(true);
    setActionError('');
    try {
      await onDeleteNotification?.(deleteTarget.id);
      setDeleteToast({ id: Date.now(), title: deleteTarget.title || 'Clinic update' });
      setDeleteTarget(null);
    } catch (error) {
      setActionError(error.message || 'The notification could not be deleted. Please try again.');
    } finally {
      setActionBusy(false);
    }
  }

  const emptyContent = {
    all: { title: 'No Notifications', message: "You're all caught up. New appointment reminders, clinic updates, and notifications will appear here." },
    unread: { title: 'No Unread Notifications', message: "You're all caught up. All notifications have been read. New appointment reminders, clinic updates, and notifications will appear here when they arrive." },
    read: { title: 'No Read Notifications', message: "Notifications you've read will appear here." },
    archived: { title: 'No Archived Notifications', message: 'Deleted notifications will appear here once they are archived. Archived notifications can be restored within 30 days before being permanently removed.' },
  }[filter];

  return <section className="notifications-page">
    <div className="notifications-breadcrumb">Clinic workspace <span>/</span> <b>Notifications</b></div>
    <header className="notifications-page-heading">
      <div><h1>Notifications <span className="notifications-unread-count">{unreadCount} unread</span></h1><p>View appointment reminders, clinic updates, and account activity.</p></div>
    </header>

    <div className="notifications-toolbar">
      <div className="notifications-tabs" role="tablist" aria-label="Notification filters">
        {FILTERS.map(item => <button type="button" role="tab" aria-selected={filter === item.id} className={filter === item.id ? 'is-active' : ''} key={item.id} onClick={() => setFilter(item.id)}>{item.label} <span>{counts[item.id]}</span></button>)}
      </div>
      <div className="notifications-toolbar-actions">
        <div className="notifications-sort"><span>Sort:</span><button type="button" aria-haspopup="listbox" aria-expanded={sortOpen} onClick={() => setSortOpen(value => !value)}>{sortOrder === 'newest' ? 'Newest first' : 'Oldest first'} <i aria-hidden="true">⌄</i></button>{sortOpen&&<div className="notifications-sort-menu" role="listbox" aria-label="Sort notifications">{[['newest','Newest first'],['oldest','Oldest first']].map(([value,label])=><button type="button" role="option" aria-selected={sortOrder===value} key={value} onClick={()=>{setSortOrder(value);setSortOpen(false)}}>{label}{sortOrder===value&&<span aria-hidden="true">✓</span>}</button>)}</div>}</div>
        {filter !== 'archived'&&<><button className="notifications-action-button" type="button" onClick={()=>runAction(onMarkNotificationsRead)}><span aria-hidden="true">✓</span>Mark All as Read</button><button className="notifications-action-button" type="button" onClick={()=>runAction(onClearReadNotifications)}><span aria-hidden="true">▤</span>Clear Read Notifications</button></>}
      </div>
    </div>

    {filter === 'archived'&&<p className="notifications-archive-note">Archived notifications are automatically removed after 30 days.</p>}

    {actionError && !deleteTarget && <p className="form-error" role="alert">{actionError}</p>}

    <div className={`notifications-list-card${selectedItems.length?' has-items':' is-empty'}`}>
      {selectedItems.length ? <ul className="notifications-list">{selectedItems.map(item=><li className={`notifications-row${item.read?' is-read':' is-unread'}${item.archived?' is-archived':''}`} key={item.id}>
        <div className="notifications-row-main">
          <NotificationIcon title={item.title} variant={item.archived?'archived':''}/>
          <div className="notifications-row-copy"><strong>{item.title||'Clinic update'}</strong><p>{item.message||'A new clinic update is available.'}</p></div>
          <time dateTime={item.archivedAt||item.createdAt}>{ageLabel(filter==='archived'?(item.archivedAt||item.createdAt):item.createdAt)}</time>
        </div>
        <div className="notifications-row-footer">
          {item.archived&&<small>{dateLabel(item.createdAt)} <span>·</span> {item.archivedRead ?? item.read ? 'Read' : 'Unread'} <span>·</span> Archived {dateLabel(item.archivedAt)}</small>}
          <div className="notifications-row-actions">{item.archived?<><button type="button" className="notifications-row-action is-restore" onClick={()=>runAction(()=>onRestoreNotification?.(item.id))}>Restore</button><button type="button" className="notifications-row-action is-delete" onClick={()=>{setActionError('');setDeleteTarget(item)}}>Delete Permanently</button></>:<button type="button" className="notifications-row-action" onClick={()=>runAction(()=>onArchiveNotification?.(item.id))}>Archive</button>}</div>
        </div>
      </li>)}</ul> : <div className="notifications-empty-state">
        <NotificationIcon variant={filter==='all'?'empty':filter}/>
        <h2>{emptyContent.title}</h2>
        <p>{emptyContent.message}</p>
        {filter==='read'&&<small>Read notifications help you keep track of past appointment reminders, clinic updates, and account activity.</small>}
        {filter==='archived'&&<div className="notifications-restore-note"><span aria-hidden="true">ⓘ</span><p>Restoring a notification returns it to its previous Read or Unread state. Upcoming appointment reminders cannot be permanently deleted before the appointment date.</p></div>}
        {filter!=='all'&&<button className="notifications-view-all" type="button" onClick={()=>setFilter('all')}>View All Notifications</button>}
      </div>}
    </div>

    {deleteTarget&&<div className="notification-delete-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setDeleteTarget(null)}}><section className="notification-delete-modal" role="dialog" aria-modal="true" aria-labelledby="notification-delete-title" aria-describedby="notification-delete-description">
      <span className="notification-delete-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"/></svg></span>
      <h2 id="notification-delete-title">Delete notification permanently?</h2>
      <p id="notification-delete-description">This will permanently delete this notification. This action cannot be undone, and the notification cannot be restored.</p>
      <div className="notification-delete-summary"><small>Notification</small><strong>{deleteTarget.title||'Clinic update'}</strong><span>{deleteTarget.message||'A new clinic update is available.'}</span><div><small>{dateLabel(deleteTarget.createdAt)} · {deleteTarget.archivedRead ?? deleteTarget.read ? 'Read' : 'Unread'}</small><small>Archived {dateLabel(deleteTarget.archivedAt)}</small></div></div>
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      <div className="notification-delete-actions"><button type="button" className="notification-delete-cancel" disabled={actionBusy} onClick={()=>{setActionError('');setDeleteTarget(null)}}>Cancel</button><button type="button" className="notification-delete-confirm" disabled={actionBusy} onClick={confirmPermanentDelete}>{actionBusy ? 'Deleting…' : 'Delete Permanently'}</button></div>
    </section></div>}

    {deleteToast&&<div className="notification-delete-toast" role="status" aria-live="polite"><span className="notification-delete-toast-icon" aria-hidden="true">✓</span><div><strong>Notification Deleted</strong><p>“{deleteToast.title}” was permanently removed.</p></div><button type="button" aria-label="Dismiss notification" onClick={()=>setDeleteToast(null)}>×</button></div>}
  </section>;
}
