export default function LinkifiedText({ text }) {
  return String(text || '').split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return part;
    const label = /google\.com\/maps/i.test(part) ? 'Open in Google Maps' : part;
    return <a href={part} key={`${index}-${part}`} target="_blank" rel="noreferrer noopener">{label}</a>;
  });
}
