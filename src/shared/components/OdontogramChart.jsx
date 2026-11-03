import { useState } from 'react';
import './OdontogramChart.css';

const rows = [
  { label: 'Permanent · upper', left: [18, 17, 16, 15, 14, 13, 12, 11], right: [21, 22, 23, 24, 25, 26, 27, 28] },
  { label: 'Primary · upper', left: [55, 54, 53, 52, 51], right: [61, 62, 63, 64, 65] },
  { label: 'Primary · lower', left: [85, 84, 83, 82, 81], right: [71, 72, 73, 74, 75] },
  { label: 'Permanent · lower', left: [48, 47, 46, 45, 44, 43, 42, 41], right: [31, 32, 33, 34, 35, 36, 37, 38] },
];
const displayDate = value => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export default function OdontogramChart({ data, assessmentDate = '', className = '' }) {
  const [selectedTooth, setSelectedTooth] = useState(null);
  const affected = new Map((data?.affectedTeeth || []).map(tooth => [Number(tooth.toothNumber), tooth]));
  const selected = affected.get(selectedTooth);
  return <div className={`odontogram${className ? ` ${className}` : ''}`}>
    <div className="odontogram-legend" aria-label="Odontogram legend">
      <span><i className="is-caries"/>Cavity</span><span><i className="is-missing"/>Missing</span><span><i className="is-fractured"/>Fractured</span><span><i className="is-buildup"/>Plaque / tartar</span><span><i className="is-other"/>Other finding</span>
    </div>
    <div className="odontogram-rows">
      {rows.map(row => <div className="odontogram-row" key={row.label}>
        <small>{row.label}</small>
        <div className="odontogram-tooth-groups">
          {[row.left, row.right].map((group, groupIndex) => <div className="odontogram-tooth-group" key={`${row.label}-${groupIndex}`}>
            {group.map(number => {
              const tooth = affected.get(number);
              const details = tooth?.findings || [];
              const title = tooth ? `FDI ${number}: ${details.map(item => `${item.finding} (${Math.round(item.confidence * 100)}% detection confidence)`).join(', ')}${assessmentDate ? ` · ${displayDate(assessmentDate)}` : ''}. ${tooth.findings.some(item => item.mappingMethod !== 'explicit FDI label') ? 'Tooth position is estimated and needs dental review.' : ''}` : `FDI tooth ${number}: no mapped indicator`;
              return <button type="button" className={`odontogram-tooth${tooth ? ` has-finding status-${tooth.status}` : ''}${selectedTooth === number ? ' is-selected' : ''}`} key={number} title={title} aria-label={title} aria-pressed={selectedTooth === number} onClick={() => setSelectedTooth(selectedTooth === number ? null : number)}>
                <span className="odontogram-tooth-glyph" aria-hidden="true"><i/></span><small>{number}</small>
              </button>;
            })}
          </div>)}
        </div>
      </div>)}
    </div>
    {selected && <div className="odontogram-selection" role="status"><b>FDI {selected.toothNumber}</b><span>{selected.findings.map(item => `${item.finding} · ${Math.round(item.confidence * 100)}%`).join(' · ')}</span>{selected.findings.some(item => item.mappingMethod !== 'explicit FDI label') && <small>Position estimated from the image; dentist verification required.</small>}</div>}
    <p className="odontogram-note">{data?.mappingNote || 'No tooth-specific indicators were mapped. A licensed dental professional should verify all AI observations.'}</p>
  </div>;
}
