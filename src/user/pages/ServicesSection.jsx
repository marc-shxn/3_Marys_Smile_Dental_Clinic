import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { dentalServiceCategories as categories } from '../../shared/data/dentalServices.js';
import './public-site.css';
import './ServicesSection.css';

export default function ServicesSection({ navigate }) {
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (!selected) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = event => { if (event.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selected]);
  const book = () => navigate('/book-appointment');
  return <>
  <section className="site-section services-section-embedded" id="services" aria-labelledby="clinic-services-title">
    <div className="section-heading services-section-heading">
      <div><h2 id="clinic-services-title" className="services-title">3 Mary’s Dental Services</h2></div>
    </div>
    <div className="services-page-grid" aria-label="Dental service categories">
      {categories.map(category => <article className="service-category-card" key={category.title}>
        <button type="button" className="service-card-open" aria-label={`Learn more about ${category.title}`} onClick={() => setSelected(category)}/>
        <img className="service-category-image" src={category.image} alt={category.alt}/>
        <div className="service-category-body">
          <h3>{category.title}</h3>
          <p className="service-category-description">{category.description}</p>
          <h4>Services include</h4>
          <ul>{category.procedures.map(procedure => <li key={procedure}>{procedure}</li>)}</ul>
          <button type="button" className="service-learn-more" onClick={() => setSelected(category)}>Learn More <span aria-hidden="true">→</span></button>
        </div>
      </article>)}
    </div>
  </section>
  {selected && createPortal(<div className="service-detail-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="service-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="service-detail-title">
        <button type="button" className="service-detail-close" aria-label="Close service details" onClick={() => setSelected(null)}>×</button>
        <img src={selected.image} alt=""/>
        <span className="eyebrow">3 MARY’S SMILE DENTAL CLINIC</span>
        <h2 id="service-detail-title">{selected.title}</h2>
        <p>{selected.detail}</p>
        <h4>Services in this category</h4>
        <ul>{selected.procedures.map(procedure => <li key={procedure}>{procedure}</li>)}</ul>
        <button type="button" className="site-button" onClick={book}>Book an Appointment</button>
      </section>
    </div>, document.body)}
  </>;
}
